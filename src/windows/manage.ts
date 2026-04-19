import { contextBridge, ipcRenderer } from "electron";

import * as kv from "../storage";

contextBridge.exposeInMainWorld("orpheus", {
  platform: process.platform,

  getWebPackCommitHash: () => ipcRenderer.invoke("manage.getWebPackCommitHash"),

  getCacheStats: () => ipcRenderer.invoke("manage.getCacheStats"),
  clearResources: (category: "http" | "lyrics") =>
    ipcRenderer.invoke("manage.clearResources", category),

  openGpuInfo: () => ipcRenderer.invoke("manage.openGpuInfo"),
});

contextBridge.exposeInMainWorld("kv", kv);
