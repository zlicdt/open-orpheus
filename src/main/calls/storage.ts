import {
  mkdir,
  readdir,
  readFile,
  rm,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import { dirname, extname, join, resolve } from "node:path";
import { existsSync, mkdirSync } from "node:fs";

import { app } from "electron";
import mime from "mime";
import { MetaPicture, MusicTagger } from "music-tag-native";

import {
  data as dataDir,
  defaultCache,
  download,
  downloadTemp,
  setCachePath,
  setDownloadPath,
} from "../folders";
import { registerCallHandler } from "../calls";
import { normalizePath, sanitizeRelativePath } from "../util";
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
import { deData, enData, ID3_AES_KEY } from "../crypto";

const ID3_COMMENT_PREFIX = "163 key(Don't modify):";

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
      filePath = normalizePath(path);
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
      const filePath = normalizePath(basePath, file.path);
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
  async (event) => {
    const files = await readdir(download);
    const items: DownloadScannerItem[] = [];
    await Promise.all(
      files.map(async (file) => {
        const filePath = join(download, file);
        if (existsSync(filePath) && (await stat(filePath)).isFile()) {
          let comment = "";
          try {
            const tagger = new MusicTagger();
            tagger.loadPath(filePath);
            if (
              !tagger.comment ||
              !tagger.comment.startsWith(ID3_COMMENT_PREFIX)
            ) {
              tagger.dispose();
              return;
            }
            const decryptedComment = deData(
              tagger.comment.slice(ID3_COMMENT_PREFIX.length),
              ID3_AES_KEY,
              false
            );
            tagger.dispose();
            if (!decryptedComment) return;
            comment = decryptedComment
              ? decryptedComment.toString("utf-8")
              : "";
          } catch (error) {
            console.error(
              `Error reading ID3 tags from ${filePath}: ${stringifyError(error)}`
            );
          }
          const statResult = await stat(filePath);
          items.push({
            comment,
            creation_time: statResult.birthtimeMs,
            last_accessed: statResult.atimeMs,
            last_modified: statResult.mtimeMs,
            path: file,
            size: statResult.size,
          });
        }
      })
    );
    event.sender.send("channel.call", "storage.ondownloadscanner", items);
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
  encrypt: boolean; // Should use .ncm format
  image_rel_path: string;
  media_rel_path: string;
  talb: string; // Track album
  tit2: string; // Track title
  tpe1: string; // Track artists
  tpos: string; // Disc number
  trck: string; // Track pos
};
// `mediaInfo` is saved to comment, with encryption (enData using its own key), prefixed with `163 key(Don't modify):`
// Reply with `storage.onaddid3done`
// - taskId
// - code? 1
// - final media path relative to download path
registerCallHandler<[string, string, string, string, AddId3Request], void>(
  "storage.addid3",
  (event, taskId, mediaPath, imagePath, mediaInfo, id3Info) => {
    // Don't block the call.
    (async () => {
      const tagger = new MusicTagger();

      mediaPath = normalizePath(mediaPath);

      tagger.loadPath(mediaPath);

      tagger.album = id3Info.talb;
      tagger.title = id3Info.tit2;
      tagger.artist = id3Info.tpe1;
      tagger.discNumber = parseInt(id3Info.tpos) || 0;
      tagger.trackNumber = parseInt(id3Info.trck) || 0;

      const imageFullPath = normalizePath(downloadTemp, imagePath);
      if (existsSync(imageFullPath)) {
        const mimeType = mime.getType(imageFullPath);
        if (mimeType) {
          const imageData = await readFile(imageFullPath);
          tagger.pictures = [new MetaPicture(mimeType, imageData)];
        }
      }

      tagger.comment = `${ID3_COMMENT_PREFIX}${enData(mediaInfo, ID3_AES_KEY, false)}`;

      let finalPath = normalizePath(download, id3Info.media_rel_path);
      if (finalPath.endsWith(".ncm")) {
        // Current we don't know what's .ncm format, just rename to the original extension
        const originalExt = extname(mediaPath);
        finalPath = finalPath.slice(0, -4) + originalExt;
      }
      tagger.save(finalPath);

      tagger.dispose();

      await rm(imageFullPath);
      await rm(mediaPath);

      event.sender.send(
        "channel.call",
        "storage.onaddid3done",
        taskId,
        1,
        id3Info.media_rel_path
      );
    })();
  }
);
