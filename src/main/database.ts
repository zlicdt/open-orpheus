import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { Database } from "@open-orpheus/database";
import { data } from "./folders";

const pathToWebDb = join(data, "webdb.dat");
const pathToMusicLibrary = join(data, "library.dat");
const pathToNativeDb = join(data, "openorpheus.db");
export const NATIVE_KV_TABLE = "kv_store";

let webDb: Database;
let musicLibraryDb: Database;
let nativeDb: DatabaseSync;

export function initializeDatabases() {
  webDb = new Database(pathToWebDb);
  musicLibraryDb = new Database(pathToMusicLibrary);

  nativeDb = new DatabaseSync(pathToNativeDb, {
    timeout: 5000,
    defensive: true,
    enableForeignKeyConstraints: true,
  });
  nativeDb.exec("PRAGMA journal_mode = WAL;");
  nativeDb.exec("PRAGMA synchronous = FULL;");
  nativeDb.exec(`
    CREATE TABLE IF NOT EXISTS ${NATIVE_KV_TABLE} (
      key        TEXT    PRIMARY KEY,
      value      BLOB    NOT NULL,
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    )
  `);
}

export function getWebDb() {
  return webDb;
}

export function getMusicLibraryDb() {
  return musicLibraryDb;
}

export function getNativeDb() {
  return nativeDb;
}
