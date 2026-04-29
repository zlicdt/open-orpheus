import type { IncomingHttpHeaders } from "node:http";
import { readFile } from "node:fs/promises";

import mime from "mime";

import type { AudioPlayInfo } from "../../preload/Player";
import client from "../request";

// #region Interval helpers

type Interval = [start: number, end: number]; // inclusive [start, end]

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

export default class AudioStreamer extends EventTarget {
  private songBuffer: SongBuffer | null = null;
  private currentAudioPlayInfo: AudioPlayInfo | null = null;

  get buffer() {
    return this.songBuffer;
  }

  get audioPlayInfo() {
    return this.currentAudioPlayInfo;
  }

  constructor() {
    super();
  }

  private static mergeInterval(intervals: Interval[], added: Interval): void {
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
  private static missingRanges(
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

  private static downloadedBytes(intervals: Interval[]): number {
    let total = 0;
    for (const [s, e] of intervals) total += e - s + 1;
    return total;
  }

  setPlayInfo(playInfo: AudioPlayInfo | null): void {
    this.currentAudioPlayInfo = playInfo;
  }

  private onProgress(progress: number): void {
    this.dispatchEvent(
      new CustomEvent<number>("progress", { detail: progress })
    );
  }

  private onComplete(): void {
    if (!this.songBuffer || !this.currentAudioPlayInfo) return;

    this.dispatchEvent(new Event("complete"));
  }

  /** Extract total file size from a response's Content-Range or Content-Length headers. */
  private parseSizeFromHeaders(headers: IncomingHttpHeaders): {
    totalSize: number;
    contentType: string;
  } {
    const getHeader = (value: string | string[] | undefined) => {
      if (Array.isArray(value)) return value[0];
      return value;
    };

    const contentType = getHeader(headers["content-type"]) ?? "audio/mpeg";
    const cr = getHeader(headers["content-range"]);
    if (cr) {
      const match = cr.match(/\/(\d+)/);
      if (match) return { totalSize: Number(match[1]), contentType };
    }
    const cl = getHeader(headers["content-length"]);
    return { totalSize: cl ? Number(cl) : 0, contentType };
  }

  private async openRangeStream(
    url: string,
    start: number,
    end?: number
  ): Promise<{ stream: NodeJS.ReadableStream; headers: IncomingHttpHeaders }> {
    const rangeValue =
      end !== undefined ? `bytes=${start}-${end}` : `bytes=${start}-`;
    const stream = client.stream(url, {
      headers: { Range: rangeValue },
      throwHttpErrors: false,
    });

    const headers = await new Promise<IncomingHttpHeaders>(
      (resolve, reject) => {
        stream.once("response", (response) => resolve(response.headers));
        stream.once("error", reject);
      }
    );

    return { stream, headers };
  }

  private ensureSongBuffer(
    songId: string,
    url: string,
    totalSize: number,
    contentType: string
  ): SongBuffer {
    if (this.songBuffer && this.songBuffer.songId === songId) {
      return this.songBuffer;
    }
    this.songBuffer = {
      songId,
      url,
      totalSize,
      buffer: Buffer.alloc(totalSize),
      intervals: [],
      backgroundFetchInProgress: false,
      contentType,
    };
    return this.songBuffer;
  }

  /** Fetch a single contiguous range from upstream and write it into the buffer. */
  private async fetchRange(
    sb: SongBuffer,
    start: number,
    end: number
  ): Promise<void> {
    const { stream } = await this.openRangeStream(sb.url, start, end);
    let offset = start;

    for await (const value of stream as AsyncIterable<Buffer>) {
      const chunk = Buffer.from(value);
      chunk.copy(sb.buffer, offset);
      offset += chunk.length;

      AudioStreamer.mergeInterval(sb.intervals, [start, offset - 1]);
      const pct = AudioStreamer.downloadedBytes(sb.intervals) / sb.totalSize;
      this.onProgress(pct);
    }

    if (AudioStreamer.downloadedBytes(sb.intervals) >= sb.totalSize) {
      this.onComplete();
    }
  }

  /** Stream a pre-opened response body into the buffer and through the controller. */
  private async streamResponseIntoBuffer(
    sb: SongBuffer,
    start: number,
    stream: NodeJS.ReadableStream,
    controller: ReadableStreamDefaultController<Uint8Array>
  ): Promise<void> {
    let offset = start;

    for await (const value of stream as AsyncIterable<Buffer>) {
      if (this.songBuffer !== sb) throw new Error("song changed");
      const chunk = Buffer.from(value);
      chunk.copy(sb.buffer, offset);
      controller.enqueue(new Uint8Array(chunk));
      offset += chunk.length;

      AudioStreamer.mergeInterval(sb.intervals, [start, offset - 1]);
      const pct = AudioStreamer.downloadedBytes(sb.intervals) / sb.totalSize;
      this.onProgress(pct);
    }

    if (AudioStreamer.downloadedBytes(sb.intervals) >= sb.totalSize) {
      this.onComplete();
    }
  }

  /** Fetch a range from upstream, streaming chunks through the controller while writing to buffer. */
  private async fetchRangeStreaming(
    sb: SongBuffer,
    start: number,
    end: number,
    controller: ReadableStreamDefaultController<Uint8Array>
  ): Promise<void> {
    const { stream } = await this.openRangeStream(sb.url, start, end);
    await this.streamResponseIntoBuffer(sb, start, stream, controller);
  }

  /**
   * Build ordered segments (have/miss) for [start, end], then stream them in order:
   * - "have" segments are enqueued from the buffer immediately
   * - "miss" segments are fetched from upstream and streamed as chunks arrive
   */
  private async streamRange(
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
        segments.push({
          have: false,
          start: cursor,
          end: Math.min(s - 1, end),
        });
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
      if (this.songBuffer !== sb) throw new Error("song changed");
      if (seg.have) {
        const copy = new Uint8Array(seg.end - seg.start + 1);
        sb.buffer.copy(Buffer.from(copy.buffer), 0, seg.start, seg.end + 1);
        controller.enqueue(copy);
      } else {
        await this.fetchRangeStreaming(sb, seg.start, seg.end, controller);
      }
    }

    controller.close();
  }

  private backgroundFetchFull(sb: SongBuffer): void {
    if (sb.backgroundFetchInProgress) return;
    sb.backgroundFetchInProgress = true;

    const gaps = AudioStreamer.missingRanges(sb.intervals, 0, sb.totalSize - 1);
    if (gaps.length === 0) {
      sb.backgroundFetchInProgress = false;
      return;
    }

    void (async () => {
      for (const gap of gaps) {
        // Abort if song changed
        if (this.songBuffer !== sb) return;
        await this.fetchRange(sb, gap[0], gap[1]);
      }
      sb.backgroundFetchInProgress = false;
    })();
  }

  async handleRequest(songId: string, request: Request): Promise<Response> {
    if (
      !this.currentAudioPlayInfo ||
      this.currentAudioPlayInfo.songId !== songId
    ) {
      return new Response("No audio play info available for this song", {
        status: 404,
      });
    }

    if (this.currentAudioPlayInfo.type !== 4) {
      // Local music, simply read from disk and return (no range support)
      const buf = await readFile(this.currentAudioPlayInfo.path);
      this.onProgress(1);
      this.onComplete();
      return new Response(buf, {
        status: 200,
        headers: {
          "Content-Type":
            mime.getType(this.currentAudioPlayInfo.path) ||
            "application/octet-stream",
          "Content-Length": String(buf.length),
        },
      });
    }

    const url = this.currentAudioPlayInfo.musicurl;
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
    if (!this.songBuffer || this.songBuffer.songId !== songId) {
      const firstUpstream = await this.openRangeStream(url, start, end);
      const info = this.parseSizeFromHeaders(firstUpstream.headers);
      if (!info.totalSize) {
        return new Response("Could not determine file size", { status: 502 });
      }
      const sb = this.ensureSongBuffer(
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
        start: (controller) => {
          this.streamResponseIntoBuffer(
            sb,
            start,
            firstUpstream.stream,
            controller
          )
            .then(() => {
              controller.close();
              if (rangeHeader) this.backgroundFetchFull(sb);
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

    const sb = this.songBuffer;
    const resolvedEnd = end ?? sb.totalSize - 1;

    if (!rangeHeader) {
      // Full request — stream from start to end
      const stream = new ReadableStream<Uint8Array>({
        start: (controller) => {
          this.streamRange(sb, 0, sb.totalSize - 1, controller).catch(() => {
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
      start: (controller) => {
        this.streamRange(sb, start, resolvedEnd, controller)
          .then(() => this.backgroundFetchFull(sb))
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
  }
}

// #endregion
