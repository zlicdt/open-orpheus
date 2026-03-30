import { join } from "node:path";

import { BrowserWindow, ipcMain } from "electron";
import { setWindowId } from "./window";
import { parseLrc } from "./lyrics";

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
    width: 1000,
    height: 300,
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
}

// --- IPC handlers ---

ipcMain.handle(
  "desktopLyrics.updateLyrics",
  (_event, lrc: string, tlrc: string) => {
    const parsed = parseLrc(lrc, tlrc || undefined);
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

ipcMain.handle("desktopLyrics.setLocked", (_event, locked: boolean) => {
  if (desktopLyricsWindow && !desktopLyricsWindow.isDestroyed()) {
    desktopLyricsWindow.setIgnoreMouseEvents(locked, { forward: true });
  }
});
