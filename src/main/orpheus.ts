import { extname, resolve } from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";

import { Protocol } from "electron";
import mime from "mime";
import unzipper from "unzipper";

import packManager from "./pack";
import WebPack from "./packs/WebPack";
import { sanitizeRelativePath } from "./util";
import { storage as storageDir, httpCache, wasm } from "./folders";
import { URLCacheManager } from "./cache/URLCacheManager";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";

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
    const fileContent = await packManager
      .getPack<WebPack>("web")
      .readFile(path);
    const contentType =
      mime.getType(extname(path)) || "application/octet-stream";
    return { content: Buffer.from(fileContent), contentType };
  } catch {
    throw new LoadError("Not Found", 404);
  }
}

function getMd5(content: Buffer<ArrayBuffer>): string {
  return createHash("md5").update(content).digest("hex");
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
      if (parsedUrl.pathname.startsWith("/wasm/")) {
        const type = parsedUrl.pathname.slice("/wasm/".length);
        const url = parsedUrl.searchParams.get("url");
        const md5 = parsedUrl.searchParams.get("MD5");
        const fetchFromServer =
          parsedUrl.searchParams.get("fetchFromServer") === "true";
        if (!url || !md5) {
          throw new LoadError(
            "Bad Request: Missing url or MD5 parameter for wasm",
            400
          );
        }
        let fileExt: string;
        try {
          fileExt = extname(new URL(url).pathname);
        } catch {
          fileExt = extname(url);
        }
        const cachedPath = resolve(wasm, md5 + fileExt);
        const cacheExists = existsSync(cachedPath);
        let shouldWriteCache = fetchFromServer || !cacheExists;
        let buf: Buffer<ArrayBuffer>;
        const doFetch = async () => {
          const res = await fetch(url);
          if (!res.ok) {
            throw new LoadError(
              `Failed to fetch wasm from url: ${res.statusText}`,
              res.status
            );
          }
          buf = Buffer.from(await res.arrayBuffer());
        };
        if (!fetchFromServer && cacheExists) {
          buf = (await readFile(cachedPath)) as Buffer<ArrayBuffer>;
          const actualMd5 = getMd5(buf);
          if (md5 !== actualMd5) {
            await doFetch();
            shouldWriteCache = true;
          }
        } else {
          await doFetch();
        }
        const actualMd5 = getMd5(buf);
        if (md5 !== actualMd5) {
          throw new LoadError(
            `Wasm MD5 mismatch: expected ${md5} but got ${actualMd5}`,
            400
          );
        }
        if (shouldWriteCache) {
          await mkdir(wasm, { recursive: true });
          await writeFile(cachedPath, buf);
        }
        if (type === "SDK") {
          const name = parsedUrl.searchParams.get("name");
          if (!name) {
            throw new LoadError(
              "Bad Request: Missing name parameter for wasm SDK",
              400
            );
          }
          const zipper = await unzipper.Open.buffer(buf);
          const file = zipper.files.find(
            (f) => f.path.toLowerCase() === name.toLowerCase()
          );
          if (!file) {
            throw new LoadError(
              `Wasm SDK zip did not contain the requested file: ${name}`,
              404
            );
          }
          return {
            content: Buffer.from(await file.buffer()),
            contentType:
              mime.getType(extname(name)) || "application/octet-stream",
          };
        } else if (type === "resource") {
          return {
            content: buf,
            contentType: mime.getType(fileExt) || "application/octet-stream",
          };
        }
        throw new LoadError(`Bad Request: Unsupported wasm type: ${type}`, 400);
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

export default function registerOrpheusScheme(protocol: Protocol) {
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
