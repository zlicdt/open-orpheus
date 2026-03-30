import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("desktopLyricsPreview", {
  requestInit(): Promise<{ style: Record<string, unknown>; text: string }> {
    return ipcRenderer.invoke("desktopLyricsPreview.requestInit");
  },
  ready() {
    ipcRenderer.invoke("desktopLyricsPreview.ready");
  },
});
