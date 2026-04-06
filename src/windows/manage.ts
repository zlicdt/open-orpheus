import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("orpheus", {
  getWebPackCommitHash: () => ipcRenderer.invoke("manage.getWebPackCommitHash"),
});
