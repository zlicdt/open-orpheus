import { createHash } from "node:crypto";
import {
  readFile,
  writeFile,
  unlink,
  readdir,
  stat,
  utimes,
  mkdir,
  rm,
} from "node:fs/promises";
import { resolve } from "node:path";

export default class URLCacheManager {
  private readonly inFlight = new Map<
    string,
    Promise<{ contentType: string; body: Buffer }>
  >();
  private readonly entries = new Map<string, { mtime: number; size: number }>();
  private totalSizeBytes = 0;
  private readonly initPromise: Promise<void>;
  private evictionPromise: Promise<void> | null = null;

  constructor(
    private readonly cacheDir: string,
    private readonly maxSizeBytes: number = 20 * 1024 * 1024
  ) {
    this.initPromise = this.buildEntriesIndex();
  }

  private async buildEntriesIndex(): Promise<void> {
    try {
      const names = await readdir(this.cacheDir);
      const stats = await Promise.all(
        names.map(async (name) => {
          try {
            const s = await stat(resolve(this.cacheDir, name));
            if (!s.isFile()) return null;
            return { name, mtime: s.mtimeMs, size: s.size };
          } catch {
            return null;
          }
        })
      );

      for (const entry of stats) {
        if (!entry) continue;
        this.entries.set(entry.name, { mtime: entry.mtime, size: entry.size });
        this.totalSizeBytes += entry.size;
      }
    } catch {
      // Directory may not exist yet.
    }
  }

  private hashUrl(url: string): string {
    return createHash("sha256").update(url).digest("hex");
  }

  private encode(contentType: string, body: Buffer): Buffer {
    const typeBytes = Buffer.from(contentType, "utf8");
    const header = Buffer.allocUnsafe(4);
    header.writeUInt32LE(typeBytes.length, 0);
    return Buffer.concat([header, typeBytes, body]);
  }

  private decode(data: Buffer): { contentType: string; body: Buffer } {
    const typeLen = data.readUInt32LE(0);
    const contentType = data.subarray(4, 4 + typeLen).toString("utf8");
    const body = data.subarray(4 + typeLen);
    return { contentType, body };
  }

  async get(
    url: string
  ): Promise<{ contentType: string; body: Buffer } | null> {
    await this.initPromise;
    const key = this.hashUrl(url);
    const filePath = resolve(this.cacheDir, key);
    try {
      const data = await readFile(filePath);
      const now = new Date();

      void utimes(filePath, now, now).catch(() => {});
      const existing = this.entries.get(key);
      if (existing) {
        existing.mtime = now.getTime();
      }
      return this.decode(data);
    } catch {
      const existing = this.entries.get(key);
      if (existing) {
        this.totalSizeBytes -= existing.size;
        this.entries.delete(key);
      }
      return null;
    }
  }

  async set(url: string, contentType: string, body: Buffer): Promise<void> {
    await this.initPromise;
    await mkdir(this.cacheDir, { recursive: true });
    const key = this.hashUrl(url);
    const filePath = resolve(this.cacheDir, key);
    const encoded = this.encode(contentType, body);
    await writeFile(filePath, encoded);
    const existing = this.entries.get(key);
    if (existing) {
      this.totalSizeBytes -= existing.size;
    }
    this.entries.set(key, { mtime: Date.now(), size: encoded.length });
    this.totalSizeBytes += encoded.length;
    await this.evictIfNeeded();
  }

  async getStats(): Promise<{ entryCount: number; sizeBytes: number }> {
    await this.initPromise;
    return { entryCount: this.entries.size, sizeBytes: this.totalSizeBytes };
  }

  async clear(): Promise<void> {
    await this.initPromise;
    try {
      await rm(this.cacheDir, { recursive: true, force: true });
    } catch {
      // Already gone
    }
    this.entries.clear();
    this.totalSizeBytes = 0;
  }

  async getOrFetch(
    url: string,
    fetcher: () => Promise<{ contentType: string; body: Buffer }>
  ): Promise<{ contentType: string; body: Buffer }> {
    const cached = await this.get(url);
    if (cached) return cached;

    const existing = this.inFlight.get(url);
    if (existing) return existing;

    const promise = fetcher()
      .then(async (result) => {
        await this.set(url, result.contentType, result.body);
        return result;
      })
      .finally(() => {
        this.inFlight.delete(url);
      });

    this.inFlight.set(url, promise);
    return promise;
  }

  private async evictIfNeeded(): Promise<void> {
    if (this.totalSizeBytes <= this.maxSizeBytes) return;
    if (this.evictionPromise) return this.evictionPromise;

    this.evictionPromise = (async () => {
      while (this.totalSizeBytes > this.maxSizeBytes) {
        const sortedEntries = [...this.entries.entries()]
          .map(([name, { mtime, size }]) => ({ name, mtime, size }))
          .sort((a, b) => a.mtime - b.mtime);

        const excessBytes = this.totalSizeBytes - this.maxSizeBytes;
        let toFreeBytes = 0;
        const toDelete: typeof sortedEntries = [];
        for (const entry of sortedEntries) {
          toDelete.push(entry);
          toFreeBytes += entry.size;
          if (toFreeBytes >= excessBytes) break;
        }

        let anyDeleted = false;
        await Promise.all(
          toDelete.map(({ name, size }) =>
            unlink(resolve(this.cacheDir, name))
              .then(() => {
                this.entries.delete(name);
                this.totalSizeBytes -= size;
                anyDeleted = true;
              })
              .catch(() => {
                // Deletion failed (e.g. file open on Windows) — leave entry
                // tracked so it will be retried on the next eviction pass.
              })
          )
        );

        // If nothing could be deleted this pass (all files in use), give up
        // to avoid an infinite loop.
        if (!anyDeleted) break;
      }
    })().finally(() => {
      this.evictionPromise = null;
    });

    return this.evictionPromise;
  }
}
