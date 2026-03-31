import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("desktopLyrics", {
  onLyricsUpdate(callback: (data: unknown) => void) {
    ipcRenderer.on("desktopLyrics.lyricsUpdate", (_event, data) =>
      callback(data)
    );
  },
  onTimeUpdate(
    callback: (data: { currentTime: number; playing: boolean }) => void
  ) {
    ipcRenderer.on("desktopLyrics.timeUpdate", (_event, data) =>
      callback(data)
    );
  },
  onStyleUpdate(callback: (data: Record<string, unknown>) => void) {
    ipcRenderer.on("desktopLyrics.styleUpdate", (_event, data) =>
      callback(data)
    );
  },
  onPlayStateChange(callback: (playing: boolean) => void) {
    ipcRenderer.on("desktopLyrics.playStateChange", (_event, playing) =>
      callback(playing)
    );
  },
  requestFullUpdate() {
    ipcRenderer.invoke("desktopLyrics.requestFullUpdate");
  },
  dragWindow() {
    ipcRenderer.invoke("channel.call", "winhelper.dragWindow");
  },
  changeOrientation() {
    ipcRenderer.invoke("desktopLyrics.changeOrientation");
  },
  performAction(action: string) {
    ipcRenderer.invoke("desktopLyrics.performAction", action);
  },
});
