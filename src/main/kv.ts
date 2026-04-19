import { ipcMain } from "electron";

import { getNativeDb as db, NATIVE_KV_TABLE } from "./database";

// #region API

type KvValue = string | Uint8Array;

type CacheEntry = {
  value: KvValue;
  hits: number;
  lastAccessSeq: number;
};

const CACHE_MAX_ENTRIES = 512;
const cache = new Map<string, CacheEntry>();
let accessSeq = 0;

function cloneKvValue(value: KvValue): KvValue {
  return typeof value === "string" ? value : new Uint8Array(value);
}

function touchCacheEntry(key: string, entry: CacheEntry): KvValue {
  entry.hits += 1;
  entry.lastAccessSeq = ++accessSeq;
  cache.set(key, entry);
  return cloneKvValue(entry.value);
}

function evictLeastAccessedIfNeeded(): void {
  if (cache.size <= CACHE_MAX_ENTRIES) {
    return;
  }

  let evictKey: string | null = null;
  let evictEntry: CacheEntry | null = null;
  for (const [key, entry] of cache) {
    if (
      evictEntry === null ||
      entry.hits < evictEntry.hits ||
      (entry.hits === evictEntry.hits &&
        entry.lastAccessSeq < evictEntry.lastAccessSeq)
    ) {
      evictKey = key;
      evictEntry = entry;
    }
  }

  if (evictKey !== null) {
    cache.delete(evictKey);
  }
}

function setCacheValue(key: string, value: KvValue): void {
  const existing = cache.get(key);
  cache.set(key, {
    value: cloneKvValue(value),
    hits: existing?.hits ?? 1,
    lastAccessSeq: ++accessSeq,
  });
  evictLeastAccessedIfNeeded();
}

export function kvGet(key: string): KvValue | null {
  const cached = cache.get(key);
  if (cached) {
    return touchCacheEntry(key, cached);
  }

  const row = db()
    .prepare(`SELECT value FROM ${NATIVE_KV_TABLE} WHERE key = ? LIMIT 1`)
    .get(key) as { value: KvValue } | undefined;
  if (!row) {
    return null;
  }

  setCacheValue(key, row.value);
  return cloneKvValue(row.value);
}

export function kvSet(key: string, value: KvValue): void {
  db()
    .prepare(
      `INSERT INTO ${NATIVE_KV_TABLE} (key, value, updated_at)
       VALUES (?, ?, unixepoch())
       ON CONFLICT(key) DO UPDATE SET
         value      = excluded.value,
         updated_at = unixepoch()`
    )
    .run(key, value);
  setCacheValue(key, value);
}

export function kvHas(key: string): boolean {
  if (cache.has(key)) {
    return true;
  }

  return Boolean(
    db()
      .prepare(`SELECT 1 FROM ${NATIVE_KV_TABLE} WHERE key = ? LIMIT 1`)
      .get(key)
  );
}

export function kvDelete(key: string): boolean {
  const result = db()
    .prepare(`DELETE FROM ${NATIVE_KV_TABLE} WHERE key = ?`)
    .run(key) as { changes: number | bigint };
  const deleted = Number(result.changes) > 0;
  if (deleted) {
    cache.delete(key);
  }
  return deleted;
}

export function kvClear(): void {
  db().exec(`DELETE FROM ${NATIVE_KV_TABLE}`);
  cache.clear();
}

export function kvSetJson<T>(key: string, value: T): void {
  kvSet(key, JSON.stringify(value));
}

export function kvGetJson<T>(key: string): T | null {
  const raw = kvGet(key);
  if (raw === null) return null;
  const text =
    typeof raw === "string" ? raw : Buffer.from(raw).toString("utf8");
  return JSON.parse(text) as T;
}

// #endregion

// #region IPC handlers

ipcMain.handle("kv.get", (_e, key: string) => kvGet(key));
ipcMain.handle("kv.set", (_e, key: string, value: KvValue) =>
  kvSet(key, value)
);
ipcMain.handle("kv.has", (_e, key: string) => kvHas(key));
ipcMain.handle("kv.delete", (_e, key: string) => kvDelete(key));
ipcMain.handle("kv.clear", () => kvClear());
ipcMain.handle("kv.setJson", (_e, key: string, value: unknown) =>
  kvSetJson(key, value)
);
ipcMain.handle("kv.getJson", (_e, key: string) => kvGetJson(key));

// #endregion
