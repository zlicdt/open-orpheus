import { protocol } from "electron";
import mime from "mime";
import { extname } from "node:path";
import { webPack } from "./pack";
import { sanitizeRelativePath } from "./util";
import { storage as storageDir, httpCache } from "./folders";
import { readFile } from "node:fs/promises";
import { URLCacheManager } from "./cache/URLCacheManager";

export const urlCache = new URLCacheManager(httpCache);

class NetworkError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
  }
}

class LoadError extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message);
    this.name = "LoadError";
  }
}

async function loadFromFilePath(
  path: string
): Promise<{ content: Buffer<ArrayBuffer>; contentType: string }> {
  try {
    const fileContent = await webPack.readFile(path);
    const contentType =
      mime.getType(extname(path)) || "application/octet-stream";
    return { content: Buffer.from(fileContent), contentType };
  } catch {
    throw new LoadError("Not Found", 404);
  }
}

export async function loadFromOrpheusUrl(url: string): Promise<{
  content: Buffer<ArrayBuffer>;
  contentType: string;
  cacheable?: boolean;
}> {
  const parsedUrl = new URL(url);
  if (parsedUrl.protocol !== "orpheus:") {
    throw new NetworkError(`Invalid URL protocol: ${parsedUrl.protocol}`);
  }

  switch (parsedUrl.hostname) {
    case "orpheus":
      if (parsedUrl.pathname === "/storage/local") {
        const path = parsedUrl.searchParams.get("file");
        if (!path) {
          throw new LoadError("Bad Request: Missing file parameter", 400);
        }
        const filePath = sanitizeRelativePath(storageDir, path);
        if (filePath === false) {
          throw new LoadError("Bad Request: Invalid file path", 400);
        }
        return {
          content: await readFile(filePath),
          contentType:
            mime.getType(extname(filePath)) || "application/octet-stream",
          cacheable: false,
        };
      }
      return await loadFromFilePath(parsedUrl.pathname);
    case "cache": {
      const url = parsedUrl.search.substring(1); // remove leading '?'
      if (!url) {
        throw new LoadError("Bad Request: Missing URL parameter", 400);
      }
      const cached = await urlCache.getOrFetch(url, async () => {
        const response = await fetch(url);
        if (!response.ok) {
          throw new LoadError(
            `Failed to fetch resource: ${response.statusText}`,
            response.status
          );
        }
        const contentType =
          response.headers.get("Content-Type") || "application/octet-stream";
        const body = Buffer.from(await response.arrayBuffer());
        return { contentType, body };
      });
      return {
        content: Buffer.from(cached.body) as Buffer<ArrayBuffer>,
        contentType: cached.contentType,
      };
    }
    default:
      throw new NetworkError(`Unknown URL hostname: ${parsedUrl.hostname}`);
  }
}

export default function () {
  protocol.handle("orpheus", async (request) => {
    try {
      const { content, contentType, cacheable } = await loadFromOrpheusUrl(
        request.url
      );
      return new Response(content, {
        headers: {
          "Content-Type": contentType,
          "Cache-Control": cacheable ? undefined : "no-store",
        },
      });
    } catch (error) {
      if (error instanceof LoadError) {
        return new Response(error.message, { status: error.status });
      } else if (error instanceof NetworkError) {
        return Response.error();
      }
    }
  });
}
