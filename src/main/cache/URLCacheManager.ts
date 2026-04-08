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

export class URLCacheManager {
  private readonly inFlight = new Map<
    string,
    Promise<{ contentType: string; body: Buffer }>
  >();
  private readonly entries = new Map<string, number>();
  private readonly initPromise: Promise<void>;
  private evictionPromise: Promise<void> | null = null;

  constructor(
    private readonly cacheDir: string,
    private readonly maxEntries: number = 500
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
            return { name, mtime: s.mtimeMs };
          } catch {
            return null;
          }
        })
      );

      for (const entry of stats) {
        if (!entry) continue;
        this.entries.set(entry.name, entry.mtime);
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
      this.entries.set(key, now.getTime());
      return this.decode(data);
    } catch {
      this.entries.delete(key);
      return null;
    }
  }

  async set(url: string, contentType: string, body: Buffer): Promise<void> {
    await this.initPromise;
    await mkdir(this.cacheDir, { recursive: true });
    const key = this.hashUrl(url);
    const filePath = resolve(this.cacheDir, key);
    await writeFile(filePath, this.encode(contentType, body));
    this.entries.set(key, Date.now());
    await this.evictIfNeeded();
  }

  async getStats(): Promise<{ entryCount: number; sizeBytes: number }> {
    await this.initPromise;
    const entryCount = this.entries.size;
    let sizeBytes = 0;
    await Promise.all(
      [...this.entries.keys()].map(async (name) => {
        try {
          const s = await stat(resolve(this.cacheDir, name));
          sizeBytes += s.size;
        } catch {
          // File may have been evicted
        }
      })
    );
    return { entryCount, sizeBytes };
  }

  async clear(): Promise<void> {
    await this.initPromise;
    try {
      await rm(this.cacheDir, { recursive: true, force: true });
    } catch {
      // Already gone
    }
    this.entries.clear();
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
    if (this.entries.size <= this.maxEntries) return;
    if (this.evictionPromise) return this.evictionPromise;

    this.evictionPromise = (async () => {
      while (this.entries.size > this.maxEntries) {
        const sortedEntries = [...this.entries.entries()]
          .map(([name, mtime]) => ({ name, mtime }))
          .sort((a, b) => a.mtime - b.mtime);

        const overflow = this.entries.size - this.maxEntries;
        const toDelete = sortedEntries.slice(0, overflow);
        await Promise.all(
          toDelete.map(({ name }) =>
            unlink(resolve(this.cacheDir, name))
              .then(() => {
                this.entries.delete(name);
              })
              .catch(() => {
                this.entries.delete(name);
              })
          )
        );
      }
    })().finally(() => {
      this.evictionPromise = null;
    });

    return this.evictionPromise;
  }
}
