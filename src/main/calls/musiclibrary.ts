import { existsSync, watch, type FSWatcher } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";

import { app } from "electron";

import { getMusicLibraryDb } from "../database";
import { registerCallHandler } from "../calls";

type MusicLibraries =
  | "<mymusic>"
  | "<download>"
  | "<windowsmedia>"
  | "<itunes>"
  | string;

type TrackEntry = {
  file: string;
  tid: string;
  aid: string;
  dir: string;
  title: string;
  album: string;
  genre: string;
  artist: string;
  duration: number;
  timestamp: number;
  bitrate: number;
  filesize: number;
  ignored: number;
  id: string;
  artistid: string;
  parentdir: string;
  track: string;
  librarypath: string;
  tracknumber: number;
  source: string;
  starttime: number;
  type: number;
};

function getLibraryPath(library: MusicLibraries): string | null {
  switch (library) {
    case "<mymusic>":
      return app.getPath("music");
    case "<download>":
      return app.getPath("downloads");
    case "<windowsmedia>":
    case "<itunes>":
      return null;
    default:
      return library;
  }
}

function generateTrackId(file: string): string {
  return createHash("sha1")
    .update(Buffer.from(file, "utf-8"))
    .digest("hex")
    .toUpperCase();
}

async function trackEntryFromFile(
  lib: string,
  file: string
): Promise<TrackEntry> {
  const fstat = await stat(file);

  // TODO: Read ID3

  return {
    file,
    tid: "",
    aid: "",
    dir: lib,
    title: path.basename(file, path.extname(file)),
    album: "",
    genre: "",
    artist: "",
    duration: 0,
    timestamp: Date.now(),
    bitrate: 0,
    filesize: fstat.size,
    ignored: 0,
    id: generateTrackId(file),
    artistid: "",
    parentdir: path.dirname(file),
    track: "",
    librarypath: getLibraryPath(lib) || "",
    tracknumber: 0,
    source: "",
    starttime: 0,
    type: 0,
  };
}

registerCallHandler<[string, string[]], [boolean]>(
  "musiclibrary.execSql",
  async (event, taskId, sql) => {
    try {
      const result = getMusicLibraryDb().executeSqls(sql);
      event.sender.send("channel.call", "musiclibrary.onexecsql", {
        error: 0,
        id: taskId,
        reason: "",
        result: true,
        ...result,
      });
    } catch (error) {
      console.error(`Error executing music library SQL: ${error}`);
      event.sender.send("channel.call", "musiclibrary.onexecsql", {
        error: 1,
        id: taskId,
        reason: "",
        result: false,
      });
    }
    return [true];
  }
);

const libWatchers: Map<MusicLibraries, FSWatcher> = new Map();
registerCallHandler<[MusicLibraries], void>(
  "musiclibrary.observeLibrary",
  (event, lib) => {
    if (libWatchers.has(lib)) return;
    const libPath = getLibraryPath(lib);
    if (!libPath) return;
    const watcher = watch(
      libPath,
      { recursive: true },
      async (eventType, filename) => {
        if (!filename) return;
        const filePath = path.join(libPath, filename);
        if (existsSync(filePath)) {
          const entry = await trackEntryFromFile(lib, filePath);
          console.log("Adding entry", entry, "to `track` table");
          // TODO: Add to SQLite DB
        } else {
          // TODO: Remove from SQLite DB
        }
        event.sender.send("channel.call", "musiclibrary.onobserveLibrary", {
          library: lib,
        });
      }
    );
    libWatchers.set(lib, watcher);
  }
);

registerCallHandler<[MusicLibraries], void>(
  "musiclibrary.removeObserveLibrary",
  (event, lib) => {
    const watcher = libWatchers.get(lib);
    if (!watcher) return;
    watcher.close();
    libWatchers.delete(lib);
  }
);

// TODO: Library adding handling
registerCallHandler<[MusicLibraries, number], [boolean]>(
  "musiclibrary.addLibrary",
  (event, library) => {
    // TODO?: Scan the library
    event.sender.send("channel.call", "musiclibrary.onaddend", {
      dirs: [""],
      library,
      reason: "",
      result: 0,
    });
    return [true];
  }
);
