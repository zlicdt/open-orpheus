import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("orpheus", {
  getWebPackCommitHash: () => ipcRenderer.invoke("manage.getWebPackCommitHash"),
  getCacheStats: () => ipcRenderer.invoke("manage.getCacheStats"),
  clearCache: (category: "http" | "lyrics") =>
    ipcRenderer.invoke("manage.clearCache", category),
});
