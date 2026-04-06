import { extname, normalize } from "node:path";

import { session } from "electron";
import mime from "mime";

import { getOrWaitSkinPack } from "./pack";

export default function () {
  const sess = session.fromPartition("open-orpheus");
  sess.protocol.handle("gui", async (request) => {
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
      default:
        return Response.error();
    }
  });
}
