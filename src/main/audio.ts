import path from "node:path";
import { readFile } from "node:fs/promises";

import { ipcMain, Protocol } from "electron";

import AudioStreamer from "./audio/streamer";

import type { AudioPlayInfo } from "src/preload/Player";
import { playCacheManager } from "./cache/PlayCacheManager";
import { mainWindow } from "./window";

const audioStreamer = new AudioStreamer();

audioStreamer.addEventListener("progress", (e: CustomEvent<number>) => {
  mainWindow.webContents.send("audio.onProgress", e.detail);
});

audioStreamer.addEventListener("complete", () => {
  const sb = audioStreamer.buffer;
  const playInfo = audioStreamer.audioPlayInfo;

  playCacheManager
    .cacheTrack(sb.songId, sb.buffer, {
      md5: playInfo.md5,
      bitrate: playInfo.bitrate,
      playInfoStr: playInfo.playInfoStr,
      volumeGain: 0,
      fileSize: sb.totalSize,
    })
    .catch((err) => {
      console.error("[audioStreamer] failed to cache track:", err);
    });
});

ipcMain.on("audio.updatePlayInfo", (event, playInfo: AudioPlayInfo | null) => {
  audioStreamer.setPlayInfo(playInfo);
  event.returnValue = undefined;
});

export default function registerAudioStreamerScheme(protocol: Protocol) {
  protocol.handle("audio", async (request) => {
    const requestUrl = new URL(request.url);

    switch (requestUrl.hostname) {
      case "worklet": {
        const workletPath = path.join(
          __dirname,
          "worklets",
          path.resolve(requestUrl.pathname)
        );
        try {
          const code = await readFile(workletPath, "utf-8");
          return new Response(code, {
            status: 200,
            headers: { "Content-Type": "application/javascript" },
          });
        } catch (e) {
          console.error("Failed to load worklet", e);
          return new Response("Failed to load worklet", { status: 500 });
        }
      }
      case "audio": {
        const songId = requestUrl.pathname.replace(/^\//, "");
        if (!songId) return new Response("Missing song ID", { status: 400 });

        return audioStreamer.handleRequest(songId, request);
      }
    }
  });
}
