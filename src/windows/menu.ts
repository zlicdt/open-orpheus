import { contextBridge, ipcRenderer } from "electron";

export interface MenuAPI {
  onShow(
    callback: (
      items: unknown[],
      templates: Record<string, string>,
      cursorX: number,
      cursorY: number
    ) => void
  ): void;
  onUpdate(callback: (items: unknown[]) => void): void;
  pull(): Promise<{ items: unknown[]; templates: Record<string, string> }>;
  reportSize(width: number, height: number): void;
  itemClick(menuId: string | null): void;
  btnClick(btnId: string): void;
  close(): void;
  isWayland(): boolean;
}

const isWaylandEnv = process.argv.includes("--wayland");

contextBridge.exposeInMainWorld("menuApi", {
  onShow(
    callback: (
      items: unknown[],
      templates: Record<string, string>,
      cursorX: number,
      cursorY: number
    ) => void
  ) {
    ipcRenderer.on("menu.show", (_event, items, templates, cursorX, cursorY) =>
      callback(items, templates, cursorX, cursorY)
    );
  },
  onUpdate(callback: (items: unknown[]) => void) {
    ipcRenderer.on("menu.update", (_event, items) => callback(items));
  },
  pull() {
    return ipcRenderer.invoke("menu.pull");
  },
  reportSize(width: number, height: number) {
    ipcRenderer.send("menu.reportSize", width, height);
  },
  itemClick(menuId: string | null) {
    ipcRenderer.send("menu.itemClick", menuId);
  },
  btnClick(btnId: string) {
    ipcRenderer.send("menu.btnClick", btnId);
  },
  close() {
    ipcRenderer.send("menu.close");
  },
  isWayland() {
    return isWaylandEnv;
  },
} satisfies MenuAPI);
