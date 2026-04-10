import { ipcMain, Protocol } from "electron";
import type { AudioPlayInfo } from "../preload/Player";
import { mainWindow } from "./window";
import { playCacheManager } from "./cache/PlayCacheManager";

// #region Interval helpers

type Interval = [start: number, end: number]; // inclusive [start, end]

function mergeInterval(intervals: Interval[], added: Interval): void {
  intervals.push(added);
  intervals.sort((a, b) => a[0] - b[0]);
  let write = 0;
  for (let i = 0; i < intervals.length; i++) {
    if (write > 0 && intervals[i][0] <= intervals[write - 1][1] + 1) {
      intervals[write - 1][1] = Math.max(
        intervals[write - 1][1],
        intervals[i][1]
      );
    } else {
      intervals[write++] = intervals[i];
    }
  }
  intervals.length = write;
}

/** Return sub-ranges of [start, end] not yet covered by `have`. */
function missingRanges(
  have: Interval[],
  start: number,
  end: number
): Interval[] {
  const missing: Interval[] = [];
  let cursor = start;
  for (const [s, e] of have) {
    if (s > cursor) missing.push([cursor, Math.min(s - 1, end)]);
    cursor = Math.max(cursor, e + 1);
    if (cursor > end) break;
  }
  if (cursor <= end) missing.push([cursor, end]);
  return missing;
}

function downloadedBytes(intervals: Interval[]): number {
  let total = 0;
  for (const [s, e] of intervals) total += e - s + 1;
  return total;
}

// #endregion

// #region Per-song buffer state

interface SongBuffer {
  songId: string;
  url: string;
  totalSize: number;
  buffer: Buffer;
  intervals: Interval[];
  backgroundFetchInProgress: boolean;
  contentType: string;
}

let songBuffer: SongBuffer | null = null;
let currentAudioPlayInfo: AudioPlayInfo | null = null;

// #endregion

// #region Progress placeholders

function onProgress(progress: number): void {
  mainWindow.webContents.send("audio.onProgress", progress);
}

function onComplete(): void {
  if (!songBuffer || !currentAudioPlayInfo) return;
  const sb = songBuffer;
  const playInfo = currentAudioPlayInfo;

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
}

// #endregion

// #region Upstream fetch helpers

/** Extract total file size from a response's Content-Range or Content-Length headers. */
function parseSizeFromResponse(resp: Response): {
  totalSize: number;
  contentType: string;
} {
  const contentType = resp.headers.get("content-type") ?? "audio/mpeg";
  const cr = resp.headers.get("content-range");
  if (cr) {
    const match = cr.match(/\/(\d+)/);
    if (match) return { totalSize: Number(match[1]), contentType };
  }
  const cl = resp.headers.get("content-length");
  return { totalSize: cl ? Number(cl) : 0, contentType };
}

function ensureSongBuffer(
  songId: string,
  url: string,
  totalSize: number,
  contentType: string
): SongBuffer {
  if (songBuffer && songBuffer.songId === songId) return songBuffer;
  songBuffer = {
    songId,
    url,
    totalSize,
    buffer: Buffer.alloc(totalSize),
    intervals: [],
    backgroundFetchInProgress: false,
    contentType,
  };
  return songBuffer;
}

/** Fetch a single contiguous range from upstream and write it into the buffer. */
async function fetchRange(
  sb: SongBuffer,
  start: number,
  end: number
): Promise<void> {
  const resp = await fetch(sb.url, {
    headers: { Range: `bytes=${start}-${end}` },
  });
  const data = Buffer.from(await resp.arrayBuffer());
  data.copy(sb.buffer, start);
  mergeInterval(sb.intervals, [start, start + data.length - 1]);

  const pct = downloadedBytes(sb.intervals) / sb.totalSize;
  onProgress(pct);
  if (pct >= 1) onComplete();
}

/** Stream a pre-opened response body into the buffer and through the controller. */
async function streamResponseIntoBuffer(
  sb: SongBuffer,
  start: number,
  resp: Response,
  controller: ReadableStreamDefaultController<Uint8Array>
): Promise<void> {
  const reader = resp.body!.getReader();
  let offset = start;

  for (;;) {
    if (songBuffer !== sb) throw new Error("song changed");
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = Buffer.from(value);
    chunk.copy(sb.buffer, offset);
    controller.enqueue(new Uint8Array(value));
    offset += chunk.length;

    mergeInterval(sb.intervals, [start, offset - 1]);
    const pct = downloadedBytes(sb.intervals) / sb.totalSize;
    onProgress(pct);
  }

  if (downloadedBytes(sb.intervals) >= sb.totalSize) onComplete();
}

/** Fetch a range from upstream, streaming chunks through the controller while writing to buffer. */
async function fetchRangeStreaming(
  sb: SongBuffer,
  start: number,
  end: number,
  controller: ReadableStreamDefaultController<Uint8Array>
): Promise<void> {
  const resp = await fetch(sb.url, {
    headers: { Range: `bytes=${start}-${end}` },
  });
  await streamResponseIntoBuffer(sb, start, resp, controller);
}

/**
 * Build ordered segments (have/miss) for [start, end], then stream them in order:
 * - "have" segments are enqueued from the buffer immediately
 * - "miss" segments are fetched from upstream and streamed as chunks arrive
 */
async function streamRange(
  sb: SongBuffer,
  start: number,
  end: number,
  controller: ReadableStreamDefaultController<Uint8Array>
): Promise<void> {
  const segments: Array<{ have: boolean; start: number; end: number }> = [];
  let cursor = start;

  for (const [s, e] of sb.intervals) {
    if (s > end) break;
    if (e < cursor) continue;
    if (s > cursor) {
      segments.push({ have: false, start: cursor, end: Math.min(s - 1, end) });
    }
    const covStart = Math.max(s, cursor);
    const covEnd = Math.min(e, end);
    if (covStart <= covEnd) {
      segments.push({ have: true, start: covStart, end: covEnd });
    }
    cursor = Math.max(cursor, e + 1);
    if (cursor > end) break;
  }
  if (cursor <= end) {
    segments.push({ have: false, start: cursor, end });
  }

  for (const seg of segments) {
    if (songBuffer !== sb) throw new Error("song changed");
    if (seg.have) {
      const copy = new Uint8Array(seg.end - seg.start + 1);
      sb.buffer.copy(Buffer.from(copy.buffer), 0, seg.start, seg.end + 1);
      controller.enqueue(copy);
    } else {
      await fetchRangeStreaming(sb, seg.start, seg.end, controller);
    }
  }

  controller.close();
}

function backgroundFetchFull(sb: SongBuffer): void {
  if (sb.backgroundFetchInProgress) return;
  sb.backgroundFetchInProgress = true;

  const gaps = missingRanges(sb.intervals, 0, sb.totalSize - 1);
  if (gaps.length === 0) {
    sb.backgroundFetchInProgress = false;
    return;
  }

  (async () => {
    for (const gap of gaps) {
      // Abort if song changed
      if (songBuffer !== sb) return;
      await fetchRange(sb, gap[0], gap[1]);
    }
    sb.backgroundFetchInProgress = false;
  })();
}

// #endregion

// #region IPC

ipcMain.on("audio.updatePlayInfo", (event, playInfo: AudioPlayInfo | null) => {
  currentAudioPlayInfo = playInfo;
  event.returnValue = undefined;
});

// #endregion

// #region Protocol handler

export default function registerAudioStreamerScheme(protocol: Protocol) {
  protocol.handle("audio", async (request) => {
    const requestUrl = new URL(request.url);
    if (requestUrl.hostname !== "audio")
      return new Response("Not found", { status: 404 });

    // Extract songId from audio://audio/<songId>
    const songId = requestUrl.pathname.replace(/^\//, "");
    if (!songId) return new Response("Missing song ID", { status: 400 });

    if (!currentAudioPlayInfo || currentAudioPlayInfo.songId !== songId) {
      return new Response("No audio play info available for this song", {
        status: 404,
      });
    }
    const url = currentAudioPlayInfo.musicurl;
    const rangeHeader = request.headers.get("range");

    // Parse requested range (if any)
    let start = 0;
    let end: number | undefined;
    if (rangeHeader) {
      const match = rangeHeader.match(/bytes=(\d+)-(\d*)/);
      if (!match) {
        return new Response("Invalid range", { status: 416 });
      }
      start = Number(match[1]);
      end = match[2] ? Number(match[2]) : undefined;
    }

    // Lazily initialise the song buffer from the first upstream request
    if (!songBuffer || songBuffer.songId !== songId) {
      const rangeValue =
        end !== undefined ? `bytes=${start}-${end}` : `bytes=${start}-`;
      const firstResp = await fetch(url, {
        headers: { Range: rangeValue },
      });
      const info = parseSizeFromResponse(firstResp);
      if (!info.totalSize) {
        return new Response("Could not determine file size", { status: 502 });
      }
      const sb = ensureSongBuffer(
        songId,
        url,
        info.totalSize,
        info.contentType
      );
      const resolvedEnd = end ?? sb.totalSize - 1;

      if (
        start >= sb.totalSize ||
        resolvedEnd >= sb.totalSize ||
        start > resolvedEnd
      ) {
        return new Response("Range not satisfiable", {
          status: 416,
          headers: { "Content-Range": `bytes */${sb.totalSize}` },
        });
      }

      // Stream the first response directly, then the rest via streamRange
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          streamResponseIntoBuffer(sb, start, firstResp, controller)
            .then(() => {
              controller.close();
              if (rangeHeader) backgroundFetchFull(sb);
            })
            .catch(() => {
              try {
                controller.close();
              } catch {
                /* already closed */
              }
            });
        },
      });

      if (!rangeHeader) {
        return new Response(stream, {
          status: 200,
          headers: {
            "Content-Type": sb.contentType,
            "Content-Length": String(sb.totalSize),
            "Accept-Ranges": "bytes",
            "Cache-Control": "no-store",
          },
        });
      }
      return new Response(stream, {
        status: 206,
        headers: {
          "Content-Type": sb.contentType,
          "Content-Length": String(resolvedEnd - start + 1),
          "Content-Range": `bytes ${start}-${resolvedEnd}/${sb.totalSize}`,
          "Accept-Ranges": "bytes",
          "Cache-Control": "no-store",
        },
      });
    }

    const sb = songBuffer!;
    const resolvedEnd = end ?? sb.totalSize - 1;

    if (!rangeHeader) {
      // Full request — stream from start to end
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          streamRange(sb, 0, sb.totalSize - 1, controller).catch(() => {
            try {
              controller.close();
            } catch {
              /* already closed */
            }
          });
        },
      });
      return new Response(stream, {
        status: 200,
        headers: {
          "Content-Type": sb.contentType,
          "Content-Length": String(sb.totalSize),
          "Accept-Ranges": "bytes",
          "Cache-Control": "no-store",
        },
      });
    }

    if (
      start >= sb.totalSize ||
      resolvedEnd >= sb.totalSize ||
      start > resolvedEnd
    ) {
      return new Response("Range not satisfiable", {
        status: 416,
        headers: { "Content-Range": `bytes */${sb.totalSize}` },
      });
    }

    // Stream the requested range, then kick off background full download
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        streamRange(sb, start, resolvedEnd, controller)
          .then(() => backgroundFetchFull(sb))
          .catch(() => {
            try {
              controller.close();
            } catch {
              /* already closed */
            }
          });
      },
    });
    return new Response(stream, {
      status: 206,
      headers: {
        "Content-Type": sb.contentType,
        "Content-Length": String(resolvedEnd - start + 1),
        "Content-Range": `bytes ${start}-${resolvedEnd}/${sb.totalSize}`,
        "Accept-Ranges": "bytes",
        "Cache-Control": "no-store",
      },
    });
  });
}

// #endregion
