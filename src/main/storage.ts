import { ipcMain } from "electron";

import { getNativeDb, NATIVE_KV_TABLE } from "./database";

// #region Module state

const TABLE = NATIVE_KV_TABLE;

function db() {
  return getNativeDb();
}

// #endregion

// #region API

type KvValue = string | Uint8Array;

export function kvGet(key: string): KvValue | null {
  const row = db()
    .prepare(`SELECT value FROM ${TABLE} WHERE key = ? LIMIT 1`)
    .get(key) as { value: KvValue } | undefined;
  return row?.value ?? null;
}

export function kvSet(key: string, value: KvValue): void {
  db()
    .prepare(
      `INSERT INTO ${TABLE} (key, value, updated_at)
       VALUES (?, ?, unixepoch())
       ON CONFLICT(key) DO UPDATE SET
         value      = excluded.value,
         updated_at = unixepoch()`
    )
    .run(key, value);
}

export function kvHas(key: string): boolean {
  return Boolean(
    db().prepare(`SELECT 1 FROM ${TABLE} WHERE key = ? LIMIT 1`).get(key)
  );
}

export function kvDelete(key: string): boolean {
  const result = db()
    .prepare(`DELETE FROM ${TABLE} WHERE key = ?`)
    .run(key) as { changes: number | bigint };
  return Number(result.changes) > 0;
}

export function kvClear(): void {
  db().exec(`DELETE FROM ${TABLE}`);
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
