import { contextBridge, ipcRenderer } from "electron";
import type { MenuSkin } from "../main/menu/types";

export interface MenuAPI {
  onShow(
    callback: (
      items: unknown[],
      templates: Record<string, string>,
      cursorX: number,
      cursorY: number,
      colors: MenuSkin
    ) => void
  ): void;
  onUpdate(callback: (items: unknown[]) => void): void;
  pull(): Promise<{
    items: unknown[];
    templates: Record<string, string>;
    colors: MenuSkin;
    cursorX?: number;
    cursorY?: number;
  }>;
  reportSize(width: number, height: number): void;
  itemClick(menuId: string | null): void;
  btnClick(btnId: string): void;
  close(): void;
  isWayland(): boolean;
  isSubmenu(): boolean;
  openSubmenu(
    items: unknown[],
    templates: Record<string, string>,
    x: number,
    y: number
  ): void;
  closeSubmenu(): void;
}

const isWaylandEnv = process.argv.includes("--wayland");

contextBridge.exposeInMainWorld("menuApi", {
  onShow(
    callback: (
      items: unknown[],
      templates: Record<string, string>,
      cursorX: number,
      cursorY: number,
      colors: MenuSkin
    ) => void
  ) {
    ipcRenderer.on(
      "menu.show",
      (_event, items, templates, cursorX, cursorY, colors) =>
        callback(items, templates, cursorX, cursorY, colors)
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
  isSubmenu() {
    return process.argv.includes("--submenu");
  },
  openSubmenu(
    items: unknown[],
    templates: Record<string, string>,
    x: number,
    y: number
  ) {
    ipcRenderer.send("menu.openSubmenu", items, templates, x, y);
  },
  closeSubmenu() {
    ipcRenderer.send("menu.closeSubmenu");
  },
} satisfies MenuAPI);
