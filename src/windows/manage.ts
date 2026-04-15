import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("orpheus", {
  getWebPackCommitHash: () => ipcRenderer.invoke("manage.getWebPackCommitHash"),

  getCacheStats: () => ipcRenderer.invoke("manage.getCacheStats"),
  clearResources: (category: "http" | "lyrics") =>
    ipcRenderer.invoke("manage.clearResources", category),

  openGpuInfo: () => ipcRenderer.invoke("manage.openGpuInfo"),
});
