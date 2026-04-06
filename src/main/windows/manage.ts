import path from "node:path";

import { BrowserWindow } from "electron";
import { webPack } from "../pack";

export default function showManageWindow() {
  const manageWnd = new BrowserWindow({
    title: "管理 Open Orpheus",
    width: 1000,
    height: 600,
    show: true,
    webPreferences: {
      partition: "open-orpheus",
      preload: path.join(__dirname, "manage.js"),
    },
  });
  manageWnd.setMenuBarVisibility(false);
  if (GUI_VITE_DEV_SERVER_URL) {
    manageWnd.loadURL(GUI_VITE_DEV_SERVER_URL);
  } else {
    manageWnd.loadFile(path.join(__dirname, "gui/index.html"));
  }
  manageWnd.webContents.ipc.handle("manage.getWebPackCommitHash", async () => {
    return webPack.getCommitHash();
  });
}
