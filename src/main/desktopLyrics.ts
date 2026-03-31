import { dirname, join } from "node:path";
import { mkdir, writeFile } from "node:fs/promises";

import { BrowserWindow, ipcMain } from "electron";
import sharp from "sharp";

import { setWindowId } from "./window";
import { parseLrc } from "./lyrics";
import { sanitizeRelativePath } from "./util";
import { storage } from "./folders";

let desktopLyricsWindow: BrowserWindow | null = null;
let mainWnd: BrowserWindow | null = null;

export function bindMainWindow(mainWindow: BrowserWindow) {
  mainWnd = mainWindow;
}

function sendToLyricsWindow(channel: string, data: unknown) {
  if (desktopLyricsWindow && !desktopLyricsWindow.isDestroyed()) {
    desktopLyricsWindow.webContents.send(channel, data);
  }
}

export default function createDesktopLyricsWindow() {
  desktopLyricsWindow = new BrowserWindow({
    width: 800, // TODO: Proper sizes
    height: 225,
    skipTaskbar: true,
    transparent: true,
    hasShadow: false,
    frame: false,
    resizable: true,
    show: false,
    webPreferences: {
      partition: "open-orpheus",
      preload: join(__dirname, "desktop-lyrics.js"),
    },
  });
  if (GUI_VITE_DEV_SERVER_URL) {
    desktopLyricsWindow.loadURL(`${GUI_VITE_DEV_SERVER_URL}/desktop-lyrics`);
  } else {
    desktopLyricsWindow.loadFile(join(__dirname, "gui/desktop-lyrics.html"));
  }
  setWindowId(desktopLyricsWindow, "desktop_lyrics");

  desktopLyricsWindow.webContents.ipc.handle(
    "desktopLyrics.requestFullUpdate",
    () => {
      if (mainWnd && !mainWnd.isDestroyed()) {
        mainWnd.webContents.send("desktopLyrics.sendFullState");
      }
    }
  );

  desktopLyricsWindow.webContents.ipc.handle(
    "desktopLyrics.performAction",
    (_event, action: string) => {
      if (mainWnd && !mainWnd.isDestroyed()) {
        mainWnd.webContents.send(
          "channel.call",
          "player.ondesktoplyricaction",
          action
        );
      }
    }
  );

  desktopLyricsWindow.webContents.ipc.handle(
    "desktopLyrics.changeOrientation",
    () => {
      const sz = desktopLyricsWindow.getSize();
      desktopLyricsWindow.setSize(sz[1], sz[0]);
    }
  );
}

// --- IPC handlers ---

ipcMain.handle(
  "desktopLyrics.updateLyrics",
  (_event, lrc: string | null, tlrc: string | null) => {
    const parsed = lrc ? parseLrc(lrc, tlrc || undefined) : null;
    sendToLyricsWindow("desktopLyrics.lyricsUpdate", parsed);
  }
);

ipcMain.handle(
  "desktopLyrics.updateTime",
  (_event, currentTime: number, playing: boolean) => {
    sendToLyricsWindow("desktopLyrics.timeUpdate", { currentTime, playing });
  }
);

ipcMain.handle(
  "desktopLyrics.updateStyle",
  (_event, styleUpdate: Record<string, unknown>) => {
    sendToLyricsWindow("desktopLyrics.styleUpdate", styleUpdate);
  }
);

ipcMain.handle("desktopLyrics.updatePlayState", (_event, playing: boolean) => {
  sendToLyricsWindow("desktopLyrics.playStateChange", playing);
});

ipcMain.handle("desktopLyrics.show", () => {
  if (desktopLyricsWindow && !desktopLyricsWindow.isDestroyed()) {
    desktopLyricsWindow.show();
  }
});

ipcMain.handle("desktopLyrics.hide", () => {
  if (desktopLyricsWindow && !desktopLyricsWindow.isDestroyed()) {
    desktopLyricsWindow.hide();
  }
});

ipcMain.handle("desktopLyrics.setTopMost", (_event, topMost: boolean) => {
  if (desktopLyricsWindow && !desktopLyricsWindow.isDestroyed()) {
    desktopLyricsWindow.setAlwaysOnTop(topMost);
  }
});

ipcMain.handle(
  "desktopLyrics.renderPreview",
  async (
    _event,
    style: Record<string, unknown>,
    text: string,
    path: string
  ) => {
    const filePath = sanitizeRelativePath(storage, path);
    if (filePath === false) {
      console.warn(
        "Attempted to save desktop lyrics preview to invalid path:",
        path
      );
      return;
    }
    const [buf, size] = await createDesktopLyricsPreview(style, text);
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, buf);
    return size;
  }
);

// --- Preview ---

export async function createDesktopLyricsPreview(
  style: Record<string, unknown>,
  text: string
): Promise<[Buffer, [number, number]]> {
  const vertical = !!style.vertical;
  const [width, height] = vertical ? [124, 310] : [310, 124];

  const previewWindow = new BrowserWindow({
    width,
    height,
    show: false,
    transparent: true,
    hasShadow: false,
    frame: false,
    resizable: false,
    useContentSize: true,
    webPreferences: {
      offscreen: true,
      partition: "open-orpheus",
      preload: join(__dirname, "desktop-lyrics-preview.js"),
    },
  });

  if (GUI_VITE_DEV_SERVER_URL) {
    previewWindow.loadURL(`${GUI_VITE_DEV_SERVER_URL}/desktop-lyrics-preview`);
  } else {
    previewWindow.loadFile(join(__dirname, "gui/desktop-lyrics-preview.html"));
  }

  return new Promise<[Buffer, [number, number]]>((resolve, reject) => {
    const timeout = setTimeout(() => {
      if (!previewWindow.isDestroyed()) previewWindow.close();
      reject(new Error("Preview generation timed out"));
    }, 10000);

    previewWindow.webContents.ipc.handle(
      "desktopLyricsPreview.requestInit",
      () => ({ style, text })
    );

    previewWindow.webContents.ipc.handle(
      "desktopLyricsPreview.ready",
      async () => {
        clearTimeout(timeout);
        try {
          const image = await previewWindow.webContents.capturePage();
          resolve([
            Buffer.from(
              await sharp(image.toPNG()).resize(width, height).toBuffer()
            ),
            [width, height],
          ]);
        } catch (err) {
          reject(err);
        } finally {
          setImmediate(() => previewWindow.close());
        }
      }
    );
  });
}
