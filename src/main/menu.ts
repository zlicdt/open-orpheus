import { BrowserWindow, screen } from "electron";
import { join, normalize } from "node:path";

import {
  captureNextWindowFirstCursorEnter,
  isWayland,
} from "@open-orpheus/window";

import { menuSkin, registerMenuSkinUpdater } from "./menu/skin";
import type { AppMenuItem, MenuClickHandler } from "./menu/types";
import { patchById } from "./menu/types";
import {
  createMenuWindow,
  createOverlayWindow,
  destroyMenuWindow,
  destroyOverlayWindow,
  getMenuWindow,
  getOverlayWindow,
} from "./menu/windows";
import packManager from "./pack";
import SkinPack from "./packs/SkinPack";

registerMenuSkinUpdater();

const WAYLAND_CURSOR_CAPTURE_DEADLINE_MS = 200;

export type { AppMenuItem, AppMenuItemBtn, MenuSkin } from "./menu/types";

export default class AppMenu extends EventTarget {
  private onClick: MenuClickHandler | null = null;
  private closed = false;
  private submenuWindow: BrowserWindow | null = null;
  /** style path → raw XML string, preloaded from skin pack */
  templates: Record<string, string> = {};

  constructor(public items: AppMenuItem[]) {
    super();
  }

  setClickHandler(handler: MenuClickHandler) {
    this.onClick = handler;
  }

  /** Collect all distinct style paths from items and load their XML from the skin pack. */
  async loadTemplates() {
    const styles = new Set<string>();
    function collect(list: AppMenuItem[]) {
      for (const item of list) {
        if (item.style) styles.add(item.style);
        if (item.children) collect(item.children);
      }
    }
    collect(this.items);

    if (styles.size === 0) return;

    const skinPack = await packManager.getOrWaitPack<SkinPack>("skin");
    const entries = await Promise.all(
      [...styles].map(async (style) => {
        try {
          const buf = await skinPack.readFile(normalize(`/${style}`));
          return [style, buf.toString("utf-8")] as const;
        } catch {
          return null;
        }
      })
    );

    this.templates = {};
    for (const entry of entries) {
      if (entry) this.templates[entry[0]] = entry[1];
    }
  }

  async show() {
    this.closed = false;
    await this.loadTemplates();

    if (process.platform === "linux" && isWayland()) {
      this.showOverlay();
    } else {
      this.showWindow();
    }
  }

  close() {
    this.closed = true;

    if (this.submenuWindow && !this.submenuWindow.isDestroyed()) {
      this.submenuWindow.destroy();
      this.submenuWindow = null;
    }

    if (process.platform === "linux" && isWayland()) {
      destroyOverlayWindow();
    } else {
      destroyMenuWindow();
    }
    this.dispatchEvent(new Event("close"));
  }

  update(patchItems: AppMenuItem[]) {
    for (const patch of patchItems) {
      if (patch.menu_id == null) continue;
      patchById(this.items, patch);
    }

    if (process.platform === "linux" && isWayland()) {
      const overlayWindow = getOverlayWindow();
      if (
        overlayWindow &&
        !overlayWindow.isDestroyed() &&
        overlayWindow.isVisible()
      ) {
        overlayWindow.webContents.send("menu.update", this.items);
      }
      return;
    }

    const menuWindow = getMenuWindow();
    if (menuWindow && !menuWindow.isDestroyed() && menuWindow.isVisible()) {
      menuWindow.webContents.send("menu.update", this.items);
    }
  }

  // --- Wayland: fullscreen transparent overlay ---
  // Created fresh each time so the compositor sends pointer-enter,
  // which the renderer uses to capture the real cursor position.
  private showOverlay() {
    const cursorPosition = new Promise<{ cursorX: number; cursorY: number }>(
      (resolve) => {
        let settled = false;
        const finish = (cursorX = 0, cursorY = 0) => {
          if (settled) return;
          settled = true;
          clearTimeout(deadline);
          resolve({ cursorX, cursorY });
        };

        const deadline = setTimeout(
          () => finish(),
          WAYLAND_CURSOR_CAPTURE_DEADLINE_MS
        );

        try {
          captureNextWindowFirstCursorEnter((cursorX, cursorY) => {
            finish(cursorX, cursorY);
          });
        } catch {
          finish();
          return;
        }
      }
    );

    const wnd = createOverlayWindow();

    const dismiss = () => {
      if (this.closed) return;
      this.close();
    };

    const onItemClick = (
      _event: Electron.IpcMainEvent,
      menuId: string | null
    ) => {
      this.onClick?.(menuId);
      dismiss();
    };

    const onBtnClick = (_event: Electron.IpcMainEvent, btnId: string) => {
      this.onClick?.(btnId);
    };

    // Renderer sends menu.close when user clicks the overlay background or presses Escape
    const onMenuClose = () => {
      dismiss();
    };

    wnd.webContents.ipc.on("menu.itemClick", onItemClick);
    wnd.webContents.ipc.on("menu.btnClick", onBtnClick);
    wnd.webContents.ipc.on("menu.close", onMenuClose);

    wnd.on("blur", () => {
      dismiss();
    });

    // Pull-based: the renderer calls menu.pull once SvelteKit has mounted.
    // We show the window here, then wait for the native first-enter capture
    // (or a short timeout fallback) before returning the initial cursor anchor.
    wnd.webContents.ipc.handle("menu.pull", async () => {
      if (!this.closed && !wnd.isDestroyed()) {
        wnd.show();
      }

      const { cursorX, cursorY } = await cursorPosition;
      return {
        items: this.items,
        templates: this.templates,
        colors: menuSkin,
        cursorX,
        cursorY,
      };
    });
  }

  // --- Non-Wayland: transparent popup BrowserWindow ---
  private showWindow() {
    const wnd = createMenuWindow();
    const cursor = screen.getCursorScreenPoint();
    const display = screen.getDisplayNearestPoint(cursor);

    // Send menu data; the renderer will measure and report back size
    const onSizeReport = (
      _event: Electron.IpcMainEvent,
      width: number,
      height: number
    ) => {
      if (this.closed || wnd.isDestroyed()) return;

      // Clamp position so menu stays within the display
      const { x: dx, y: dy, width: dw, height: dh } = display.workArea;
      // Top half of work area → top-left anchor; bottom half → bottom-left anchor
      const onBottomHalf = cursor.y > dy + dh / 2;
      let x = cursor.x;
      let y = onBottomHalf ? cursor.y - height : cursor.y;

      if (x + width > dx + dw) x = dx + dw - width;
      if (y + height > dy + dh) y = dy + dh - height;
      if (x < dx) x = dx;
      if (y < dy) y = dy;

      wnd.setBounds({
        x: Math.round(x),
        y: Math.round(y),
        width: Math.round(width),
        height: Math.round(height),
      });
      wnd.showInactive();
      wnd.focus();
    };

    const onItemClick = (
      _event: Electron.IpcMainEvent,
      menuId: string | null
    ) => {
      this.onClick?.(menuId);
      this.close();
    };

    const onBtnClick = (_event: Electron.IpcMainEvent, btnId: string) => {
      this.onClick?.(btnId);
    };

    const onMenuClose = () => {
      this.close();
    };

    const closeSubmenuWindow = () => {
      if (this.submenuWindow && !this.submenuWindow.isDestroyed()) {
        this.submenuWindow.destroy();
        this.submenuWindow = null;
      }
    };

    const openSubmenuWindow = (
      items: unknown[],
      templates: Record<string, string>,
      relX: number,
      relY: number
    ) => {
      closeSubmenuWindow();
      const bounds = wnd.getBounds();
      const screenX = bounds.x + Math.round(relX);
      const screenY = bounds.y + Math.round(relY);
      const subDisplay = screen.getDisplayNearestPoint({
        x: screenX,
        y: screenY,
      });

      const sub = new BrowserWindow({
        show: false,
        frame: false,
        transparent: true,
        backgroundColor: "#00000000",
        hasShadow: true,
        skipTaskbar: true,
        resizable: false,
        alwaysOnTop: true,
        focusable: true,
        webPreferences: {
          partition: "open-orpheus",
          preload: join(__dirname, "menu.js"),
          additionalArguments: ["--submenu"],
        },
      });
      this.submenuWindow = sub;

      if (GUI_VITE_DEV_SERVER_URL) {
        sub.loadURL(`${GUI_VITE_DEV_SERVER_URL}/menu`);
      } else {
        sub.loadURL("gui://frontend/menu");
      }

      sub.on("closed", () => {
        if (this.submenuWindow === sub) this.submenuWindow = null;
      });

      sub.webContents.ipc.on(
        "menu.reportSize",
        (_event, width: number, height: number) => {
          if (sub.isDestroyed()) return;
          const { x: dx, y: dy, width: dw, height: dh } = subDisplay.workArea;
          let x = screenX;
          let y = screenY;
          if (x + width > dx + dw) x = bounds.x - Math.round(width);
          if (y + height > dy + dh) y = dy + dh - height;
          if (x < dx) x = dx;
          if (y < dy) y = dy;
          sub.setBounds({
            x: Math.round(x),
            y: Math.round(y),
            width: Math.round(width),
            height: Math.round(height),
          });
          sub.showInactive();
        }
      );

      sub.webContents.ipc.on(
        "menu.itemClick",
        (_event, menuId: string | null) => {
          this.onClick?.(menuId);
          this.close();
        }
      );

      sub.webContents.ipc.on("menu.btnClick", (_event, btnId: string) => {
        this.onClick?.(btnId);
      });

      sub.on("blur", () => {
        setTimeout(() => {
          // If focus went back to the main menu, keep open
          if (!wnd.isDestroyed() && wnd.isFocused()) return;
          if (!this.closed) {
            this.close();
          }
        }, 100);
      });

      sub.webContents.ipc.handle("menu.pull", () => {
        return { items, templates, colors: menuSkin };
      });
    };

    wnd.webContents.ipc.on("menu.reportSize", onSizeReport);
    wnd.webContents.ipc.on("menu.itemClick", onItemClick);
    wnd.webContents.ipc.on("menu.btnClick", onBtnClick);
    wnd.webContents.ipc.on("menu.close", onMenuClose);
    wnd.webContents.ipc.on(
      "menu.openSubmenu",
      (_event, items, templates, relX, relY) => {
        openSubmenuWindow(items, templates, relX, relY);
      }
    );
    wnd.webContents.ipc.on("menu.closeSubmenu", closeSubmenuWindow);

    const blurCheck = () => {
      // If focus moved to the submenu window, keep the menu open
      if (
        this.submenuWindow &&
        !this.submenuWindow.isDestroyed() &&
        this.submenuWindow.isFocused()
      ) {
        return;
      }
      // If the main window regained focus (e.g. brief WM focus shuffle), keep open
      if (!wnd.isDestroyed() && wnd.isFocused()) {
        return;
      }
      if (!this.closed) {
        this.close();
        onMenuClose();
      }
    };

    wnd.on("blur", () => {
      setTimeout(blurCheck, 100);
    });

    // Pull-based bootstrap so renderer can always request data after mount.
    wnd.webContents.ipc.handle("menu.pull", () => {
      return { items: this.items, templates: this.templates, colors: menuSkin };
    });
  }
}
