import { extname, join, normalize } from "node:path";
import { readFile } from "node:fs/promises";

import { Protocol } from "electron";
import mime from "mime";

import { getOrWaitSkinPack } from "./pack";

const guiDir = join(__dirname, "gui");

export default function registerGuiScheme(protocol: Protocol) {
  protocol.handle("gui", async (request) => {
    const url = new URL(request.url);
    switch (url.hostname) {
      case "skin": {
        const skinPack = await getOrWaitSkinPack();
        try {
          const file = await skinPack.readFile(normalize(url.pathname));
          return new Response(Buffer.from(file), {
            headers: {
              "Content-Type":
                mime.getType(extname(url.pathname)) ||
                "application/octet-stream",
            },
          });
        } catch {
          return Response.error();
        }
      }
      case "frontend": {
        // Serve SvelteKit static build files.
        // Route paths like /desktop-lyrics map to desktop-lyrics.html,
        // while asset paths like /_app/immutable/... are served as-is.
        const pathname = normalize(url.pathname);
        const filePath = join(guiDir, pathname);

        // Prevent path traversal outside guiDir
        if (!filePath.startsWith(guiDir)) {
          return new Response("Forbidden", { status: 403 });
        }

        // Try exact path first, then fall back to .html for route paths
        const candidates = [filePath];
        if (!extname(pathname)) {
          candidates.push(
            pathname === "/" ? join(guiDir, "index.html") : `${filePath}.html`
          );
        }

        for (const candidate of candidates) {
          try {
            const file = await readFile(candidate);
            return new Response(file, {
              headers: {
                "Content-Type":
                  mime.getType(extname(candidate)) ||
                  "application/octet-stream",
              },
            });
          } catch {
            continue;
          }
        }

        return new Response("Not Found", { status: 404 });
      }
      default:
        return Response.error();
    }
  });
}
