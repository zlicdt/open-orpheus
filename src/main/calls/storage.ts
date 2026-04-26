import { mkdir, readdir, readFile, unlink, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { existsSync, mkdirSync } from "node:fs";

import { app } from "electron";

import {
  data as dataDir,
  defaultCache,
  setCachePath,
  setDownloadPath,
} from "../folders";
import { registerCallHandler } from "../calls";
import { sanitizeRelativePath } from "../util";
import { getWebDb } from "../database";
import {
  CacheTrackMeta,
  type PlayCacheConfig,
  type PlayCacheInfo,
} from "../cache/PlayCacheManager";
import createCacheManager, {
  lyricCacheManager,
  playCacheManager,
} from "../cache";
import { stringifyError } from "../../util";

registerCallHandler<[string, string, string], [string, string]>(
  "storage.init",
  (event, downloadDir, someNumStr, cacheDir) => {
    if (!downloadDir) {
      downloadDir = resolve(app.getPath("downloads"), "CloudMusic");
    }
    if (!cacheDir) {
      cacheDir = defaultCache;
    }
    mkdirSync(downloadDir, { recursive: true });
    mkdirSync(cacheDir, { recursive: true });
    setDownloadPath(downloadDir);
    setCachePath(cacheDir);
    createCacheManager();
    return [downloadDir, cacheDir];
  }
);

registerCallHandler<[string, string, boolean, string], void>(
  "storage.readfromfile",
  async (event, taskId, path) => {
    const filePath = sanitizeRelativePath(dataDir, path);
    if (filePath === false) {
      throw new Error(`Forbidden file path access attempt: ${path}`);
    }
    try {
      const fileContent = await readFile(filePath);
      event.sender.send(
        "channel.call",
        "storage.onreadfromfiledone",
        taskId,
        0,
        fileContent.toString("utf-8")
      );
    } catch {
      // -2: Not Found
      event.sender.send(
        "channel.call",
        "storage.onreadfromfiledone",
        taskId,
        -2
      );
    }
  }
);

registerCallHandler<[string, string], void>(
  "storage.execsql",
  async (event, taskId, sql) => {
    try {
      const execResult = getWebDb().executeSql(sql);
      event.sender.send(
        "channel.call",
        "storage.onexecsqldone",
        taskId,
        ...execResult
      );
    } catch (error) {
      console.error(`Error executing SQL: ${stringifyError(error)}`);
      event.sender.send(
        "channel.call",
        "storage.onexecsqldone",
        taskId,
        1,
        undefined,
        [0, 0, 0]
      );
    }
  }
);

registerCallHandler<[string, string], void>(
  "storage.exectransaction",
  async (event, taskId, sql) => {
    try {
      const execResult = getWebDb().executeTransaction(sql);
      event.sender.send(
        "channel.call",
        "storage.onexecsqldone",
        taskId,
        ...execResult
      );
    } catch (error) {
      console.error(
        `Error executing SQL transaction: ${stringifyError(error)}`
      );
      event.sender.send(
        "channel.call",
        "storage.onexecsqldone",
        taskId,
        1,
        undefined,
        [0, 0, 0]
      );
    }
  }
);

registerCallHandler<
  [string, string, string, string, boolean, "abs" | "rel"],
  void
>(
  "storage.savetofile",
  async (event, taskId, content, mode, path, alone, type) => {
    let filePath: string;
    if (type === "rel") {
      const p = sanitizeRelativePath(dataDir, path);
      if (p === false) {
        throw new Error(`Forbidden file path access attempt: ${path}`);
      }
      filePath = p;
    } else {
      filePath = path;
    }

    await mkdir(dirname(filePath), { recursive: true });

    try {
      await writeFile(filePath, content, { flag: "w" });
      event.sender.send("channel.call", "storage.onsavetofiledone", taskId, 0);
    } catch (error) {
      event.sender.send(
        "channel.call",
        "storage.onsavetofiledone",
        taskId,
        -1,
        stringifyError(error)
      );
    }
  }
);

registerCallHandler<[string, { id: string; path: string }[], string], void>(
  "storage.checkFilesExist",
  async (event, taskId, files, basePath) => {
    const results = files.map(async (file) => {
      const filePath = join(basePath, file.path);
      return { id: file.id, exists: existsSync(filePath) };
    });
    event.sender.send(
      "channel.call",
      "storage.oncheckfilesexist",
      taskId,
      true,
      results
    );
  }
);

// eslint-disable-next-line @typescript-eslint/no-unused-vars
type DownloadScannerItem = {
  comment: string; // comment added by addid3
  creation_time: number; // timestamp
  last_accessed: number;
  last_modified: number;
  path: string; // path relative to download dir
  size: number;
};
// Reply with `storage.ondownloadscanner`
// - array of `DownloadScannerItem`
registerCallHandler<[string, boolean, string, number, string[]], void>(
  "storage.downloadscanner",
  (event) => {
    // TODO: Scan download dir for downloaded music
    event.sender.send("channel.call", "storage.ondownloadscanner", []);
  }
);

registerCallHandler<[], void>("storage.queryCacheTracks", async (event) => {
  if (!playCacheManager) return;
  const wnd = event.sender;
  if (!wnd) return;
  const tracks = await playCacheManager.queryCacheTracks();
  wnd.send("channel.call", "storage.onquerycachetracks", tracks);
  return;
});

registerCallHandler<
  [
    {
      trackId: string;
      bitrate: number;
      md5: string;
    },
  ],
  [CacheTrackMeta | null]
>("storage.queryNewCacheTrack", async (event, track) => {
  if (!playCacheManager) return [null];
  const wnd = event.sender;
  if (!wnd) return [null];
  const cachedTrack = await playCacheManager.getCachedTrack(track.trackId);
  if (
    !cachedTrack ||
    track.bitrate !== cachedTrack.meta.bitrate ||
    (track.md5 && track.md5 !== cachedTrack.meta.md5)
  )
    return [null];
  return [cachedTrack.meta];
});

registerCallHandler<[PlayCacheConfig], void>(
  "storage.setPlayCacheConfig",
  (event, config) => {
    playCacheManager?.setConfig(config);
  }
);

registerCallHandler<[], [PlayCacheInfo | undefined]>(
  "storage.playCacheInfo",
  async () => {
    const info = await playCacheManager?.getInfo();
    return [info];
  }
);

registerCallHandler<[""], [boolean]>("storage.clearCache", async () => {
  if (!playCacheManager) return [false];
  try {
    await playCacheManager.clearAll();
    return [true];
  } catch {
    return [false];
  }
});

registerCallHandler<[string], void>(
  "storage.getTempFile",
  async (event, songId) => {
    let content = "";
    try {
      content = (await lyricCacheManager?.get(songId)) ?? "";
    } catch (error) {
      console.error(
        `Error reading temp file for songId ${songId}: ${stringifyError(error)}`
      );
    }
    event.sender.send(
      "channel.call",
      "storage.ongettempfile",
      songId,
      content ? 0 : 404,
      content
    );
  }
);

registerCallHandler<[string, string, string], void>(
  "storage.updatetemp",
  async (event, songId, content, type) => {
    if (!lyricCacheManager) return;

    if (type !== "text/plain") {
      console.error(`Unsupported temp file type: ${type}`);
      return;
    }

    try {
      await lyricCacheManager.set(songId, content);
    } catch (error) {
      console.error(
        `Error writing temp file for songId ${songId}: ${stringifyError(error)}`
      );
    }
  }
);

registerCallHandler<[string], [boolean]>(
  "storage.testwriteable",
  async (event, path) => {
    const testFilePath = join(path, "open_orpheus_test_writable.tmp");
    try {
      await writeFile(testFilePath, "test", { flag: "w" });
      await unlink(testFilePath);
      return [true];
    } catch {
      return [false];
    }
  }
);

registerCallHandler<[string, "abs" | "rel", "", string], void>(
  "storage.listFile",
  (event, taskId, type, emptyStr, path) => {
    let filePath: string;
    if (type === "rel") {
      const p = sanitizeRelativePath(dataDir, path);
      if (p === false) {
        throw new Error(`Forbidden file path access attempt: ${path}`);
      }
      filePath = p;
    } else {
      filePath = path;
    }
    readdir(filePath, { withFileTypes: true })
      .then((dirents) => {
        const files = dirents.map((dirent) => ({
          name: dirent.name,
          path: join(filePath, dirent.name),
          type: dirent.isDirectory() ? "directory" : "file",
        }));
        event.sender.send(
          "channel.call",
          "storage.onlistfile",
          taskId,
          0,
          files
        );
      })
      .catch((error) => {
        console.error(`Error listing files in ${filePath}: ${error.message}`);
        // TODO: Some error code?
        event.sender.send("channel.call", "storage.onlistfile", taskId, 1, []);
      });
  }
);

type AddId3Request = {
  encrypt: boolean;
  image_rel_path: string;
  media_rel_path: string;
  talb: string; // Track album
  tit2: string; // Track title
  tpe1: string; // Track artists
  tpos: string; // Track number? "01"
  trck: string; // Track number? "1"
};
// `mediaInfo` is saved to comment, with encryption (enData using its own key), prefixed with `163 key(Don't modify):`
// Reply with `storage.onaddid3done`
// - taskId
// - code? 1
// - final media path relative to download path
registerCallHandler<[string, string, string, string, AddId3Request], void>(
  "storage.addid3",
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  (event, taskId, mediaPath, imagePath, mediaInfo, id3Info) => {}
);
