import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

import { registerCallHandler } from "../calls";
import client from "../request";
import { downloadTemp } from "../folders";
import { normalizePath } from "../util";

type DownloadStartRequest = {
  ext_header: string;
  id: string;
  md5: string;
  md5_check_fail: number; // 0 or 1?
  mediaType: number;
  pre_path: string;
  rel_path: string;
  size: number;
  url: string;
};

// Payload of `download.onprocess`
type DownloadProcessPayload = {
  down: number; // Downloaded bytes
  islast: boolean; // Is the last progress update
  path: string; // Local file path
  relative: string; // Relative path from the download request
  speed: number; // Download speed in bytes/sec
  total: number; // Total bytes to download
  type: number;
};

registerCallHandler<[DownloadStartRequest], void>(
  "download.start",
  (event, request: DownloadStartRequest) => {
    // Early resolve the call
    (async function () {
      const {
        ext_header,
        id,
        //md5,
        //md5_check_fail,
        //mediaType,
        //pre_path,
        rel_path,
        size,
        url,
      } = request;

      // Parse headers from JSON string
      let headers: Record<string, string> = {};
      if (ext_header) {
        try {
          headers = JSON.parse(ext_header);
        } catch (error) {
          console.error("Failed to parse ext_header JSON:", error);
        }
      }

      // Construct destination path: tmpdir + rel_path
      const destPath = normalizePath(downloadTemp, rel_path);

      // Ensure directory exists
      try {
        await fs.mkdir(path.dirname(destPath), { recursive: true });
      } catch (error) {
        console.error("Failed to create download directory:", error);
        return;
      }

      let downloadedBytes = 0;
      const startTime = Date.now();

      // Speed calculation with exponential moving average
      let smoothedSpeed = 0;
      const EMA_ALPHA = 0.3; // Smoothing factor (0-1, lower = more stable)
      let lastUpdateTime = startTime;
      let lastDownloadedBytes = 0;
      const MIN_UPDATE_INTERVAL = 100; // Minimum ms between speed updates

      try {
        const response = client.stream(url, {
          headers,
        });

        const fsHandle = await fs.open(destPath, "w");
        const writeStream = fsHandle.createWriteStream();
        const hash = crypto.createHash("md5");

        response.on("data", async (chunk: Buffer) => {
          downloadedBytes += chunk.length;
          hash.update(chunk);

          // Send progress update only if minimum interval has passed
          const currentTime = Date.now();
          const timeDiff = (currentTime - lastUpdateTime) / 1000;

          if (
            timeDiff >= MIN_UPDATE_INTERVAL / 1000 ||
            downloadedBytes === chunk.length
          ) {
            const bytesDiff = downloadedBytes - lastDownloadedBytes;
            const instantSpeed = timeDiff > 0 ? bytesDiff / timeDiff : 0;

            // Apply exponential moving average for stability
            smoothedSpeed =
              smoothedSpeed === 0
                ? instantSpeed
                : EMA_ALPHA * instantSpeed + (1 - EMA_ALPHA) * smoothedSpeed;

            const speed = smoothedSpeed;

            const payload: DownloadProcessPayload = {
              down: downloadedBytes,
              islast: false,
              path: destPath,
              relative: rel_path,
              speed,
              total: size,
              type: 0,
            };

            event.sender.send(
              "channel.call",
              "download.onprocess",
              id,
              payload
            );

            lastUpdateTime = currentTime;
            lastDownloadedBytes = downloadedBytes;
          }
        });

        response.pipe(writeStream);

        await new Promise<void>((resolve, reject) => {
          response.on("end", () => resolve());
          response.on("error", (error) => reject(error));
          writeStream.on("error", (error) => reject(error));
        });

        writeStream.close();

        // Send final progress update with islast: true using accumulated average
        const totalTime = (Date.now() - startTime) / 1000;
        const finalSpeed =
          totalTime > 0 ? downloadedBytes / totalTime : smoothedSpeed;

        const finalPayload: DownloadProcessPayload = {
          down: downloadedBytes,
          islast: true,
          path: destPath,
          relative: rel_path,
          speed: Math.max(smoothedSpeed, finalSpeed), // Use whichever is more reliable
          total: size,
          type: 0,
        };

        event.sender.send(
          "channel.call",
          "download.onprocess",
          id,
          finalPayload
        );
      } catch (error) {
        console.error("Download failed for:", url, error);
      }
    })();
  }
);
