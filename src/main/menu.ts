import { BrowserWindow, screen } from "electron";
import { join, normalize } from "node:path";

import { isWayland } from "@open-orpheus/window";

import packManager from "./pack";
import SkinPack from "./packs/SkinPack";
import sharp, { SharpInput } from "sharp";

export type AppMenuItemBtn = {
  id: string;
  url: string;
  enable: boolean;
};

export type AppMenuItem = {
  text: string;
  menu: boolean;
  enable: boolean;
  separator: boolean;
  children: AppMenuItem[] | null;
  hotkey?: string;
  image_color: string;
  image_path?: string;
  check_image_path?: string;
  menu_id: string | null;
  style?: string;
  btns?: AppMenuItemBtn[];
};

type MenuClickHandler = (menuId: string | null) => void;

export type MenuSkin = {
  background: string;
  foreground: string;
  foregroundDisabled: string;
  separator: string;
  itemHover: string;
};

const menuSkin: MenuSkin = {
  background: "#fffffffa",
  foreground: "#1e1e1e",
  foregroundDisabled: "#a0a0a0",
  separator: "#0000001a",
  itemHover: "#e1ebfc",
};

function patchById(items: AppMenuItem[], patch: AppMenuItem): boolean {
  for (let i = 0; i < items.length; i++) {
    if (items[i].menu_id === patch.menu_id) {
      items[i] = patch;
      return true;
    }
    if (items[i].children && patchById(items[i].children!, patch)) {
      return true;
    }
  }
  return false;
}

async function extractColor(img: SharpInput): Promise<string> {
  const image = sharp(img);
  const { width = 1, height = 1 } = await image.metadata();
  const cx = Math.floor(width / 2);
  const cy = Math.floor(height / 2);
  const { data } = await image
    .extract({ left: cx, top: cy, width: 1, height: 1 })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const [r, g, b, a] = data;
  return `#${[r, g, b, a].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

function abgrToCssHex(abgr: string): string {
  const hex = abgr.replace(/^#/, "");
  const a = hex.slice(0, 2);
  const b = hex.slice(2, 4);
  const g = hex.slice(4, 6);
  const r = hex.slice(6, 8);
  return `#${r}${g}${b}${a}`;
}

packManager.addEventListener("skin2packloaded", async (e: CustomEvent) => {
  console.log("skinpackloaded", e.detail);
  const skinPack = packManager.getPack<SkinPack>("skin2");
  const [bg, hov, sep, elBuf] = await Promise.all(
    [
      "/menu/bk.png",
      "/menu/hover.png",
      "/menu/separator.png",
      "/menu/element.xml",
    ].map((p) => skinPack.readFile(p))
  );
  const [bgColor, hoverColor, separatorColor] = await Promise.all(
    [bg, hov, sep].map(extractColor)
  );

  const xml = elBuf.toString("utf-8");
  const fgMatch = xml.match(/\btextcolor="(#[0-9A-Fa-f]{8})"/);
  const fgDisabledMatch = xml.match(/\bdisabledtextcolor="(#[0-9A-Fa-f]{8})"/);

  console.log(
    "colors",
    bgColor,
    hoverColor,
    separatorColor,
    fgMatch,
    fgDisabledMatch
  );

  menuSkin.background = bgColor;
  menuSkin.itemHover = hoverColor;
  menuSkin.separator = separatorColor;
  if (fgMatch) menuSkin.foreground = abgrToCssHex(fgMatch[1]);
  if (fgDisabledMatch)
    menuSkin.foregroundDisabled = abgrToCssHex(fgDisabledMatch[1]);
});

// Shared menu window singleton (non-Wayland only)
let menuWindow: BrowserWindow | null = null;

// Per-show overlay window (Wayland only) — created fresh each time,
// destroyed on close so the compositor sends pointer-enter on the next show.
let overlayWindow: BrowserWindow | null = null;

function getOrCreateMenuWindow(): BrowserWindow {
  if (menuWindow && !menuWindow.isDestroyed()) {
    return menuWindow;
  }

  menuWindow = new BrowserWindow({
    width: 300,
    height: 400,
    show: false,
    frame: false,
    transparent: true,
    hasShadow: true,
    skipTaskbar: true,
    resizable: false,
    alwaysOnTop: true,
    focusable: true,
    webPreferences: {
      partition: "open-orpheus",
      preload: join(__dirname, "menu.js"),
    },
  });

  if (GUI_VITE_DEV_SERVER_URL) {
    menuWindow.loadURL(`${GUI_VITE_DEV_SERVER_URL}/menu`);
  } else {
    menuWindow.loadURL("gui://frontend/menu");
  }

  menuWindow.on("closed", () => {
    menuWindow = null;
  });

  return menuWindow;
}

function createOverlayWindow(): BrowserWindow {
  // Destroy any leftover overlay from a previous show
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.destroy();
    overlayWindow = null;
  }

  overlayWindow = new BrowserWindow({
    x: 0,
    y: 0,
    frame: false,
    transparent: true,
    hasShadow: false,
    skipTaskbar: true,
    resizable: true,
    alwaysOnTop: true,
    focusable: true,
    fullscreen: true,
    webPreferences: {
      partition: "open-orpheus",
      preload: join(__dirname, "menu.js"),
      additionalArguments: ["--wayland"],
    },
  });

  if (GUI_VITE_DEV_SERVER_URL) {
    overlayWindow.loadURL(`${GUI_VITE_DEV_SERVER_URL}/menu`);
  } else {
    overlayWindow.loadURL("gui://frontend/menu");
  }

  overlayWindow.on("closed", () => {
    overlayWindow = null;
  });

  return overlayWindow;
}

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
      // Destroy the overlay so the next show() creates a fresh window
      // and the compositor sends pointer-enter again.
      if (overlayWindow && !overlayWindow.isDestroyed()) {
        overlayWindow.destroy();
        overlayWindow = null;
      }
    } else {
      if (menuWindow && !menuWindow.isDestroyed()) {
        menuWindow.hide();
      }
    }
    this.dispatchEvent(new Event("close"));
  }

  update(patchItems: AppMenuItem[]) {
    for (const patch of patchItems) {
      if (patch.menu_id == null) continue;
      patchById(this.items, patch);
    }

    if (process.platform === "linux" && isWayland()) {
      if (
        overlayWindow &&
        !overlayWindow.isDestroyed() &&
        overlayWindow.isVisible()
      ) {
        overlayWindow.webContents.send("menu.update", this.items);
      }
      return;
    }

    if (menuWindow && !menuWindow.isDestroyed() && menuWindow.isVisible()) {
      menuWindow.webContents.send("menu.update", this.items);
    }
  }

  // --- Wayland: fullscreen transparent overlay ---
  // Created fresh each time so the compositor sends pointer-enter,
  // which the renderer uses to capture the real cursor position.
  private showOverlay() {
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

    // Pull-based: the renderer calls menu.pull once SvelteKit has mounted
    // and has registered its pointermove listener for cursor capture.
    // We show the window here so the compositor sends pointer-enter AFTER
    // the listener is in place.
    wnd.webContents.ipc.handle("menu.pull", () => {
      if (!this.closed && !wnd.isDestroyed()) {
        wnd.show();
      }
      return { items: this.items, templates: this.templates, colors: menuSkin };
    });
  }

  // --- Non-Wayland: transparent popup BrowserWindow ---
  private showWindow() {
    const wnd = getOrCreateMenuWindow();
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
      if (!this.closed) {
        this.closed = true;
        this.dispatchEvent(new Event("close"));
      }
      cleanup();
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
          onMenuClose();
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
            onMenuClose();
          }
        }, 100);
      });

      sub.webContents.ipc.handle("menu.pull", () => {
        return { items, templates, colors: menuSkin };
      });
    };

    const cleanup = () => {
      wnd.webContents.ipc.removeListener("menu.reportSize", onSizeReport);
      wnd.webContents.ipc.removeListener("menu.itemClick", onItemClick);
      wnd.webContents.ipc.removeListener("menu.btnClick", onBtnClick);
      wnd.webContents.ipc.removeListener("menu.close", onMenuClose);
      wnd.webContents.ipc.removeAllListeners("menu.openSubmenu");
      wnd.webContents.ipc.removeAllListeners("menu.closeSubmenu");
    };

    // Clean up any previous listeners
    wnd.webContents.ipc.removeAllListeners("menu.reportSize");
    wnd.webContents.ipc.removeAllListeners("menu.itemClick");
    wnd.webContents.ipc.removeAllListeners("menu.btnClick");
    wnd.webContents.ipc.removeAllListeners("menu.close");
    wnd.webContents.ipc.removeAllListeners("menu.openSubmenu");
    wnd.webContents.ipc.removeAllListeners("menu.closeSubmenu");
    wnd.removeAllListeners("blur");

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

    // Send data to renderer (it may still be loading, so we also handle a ready request)
    const sendData = () => {
      wnd.webContents.send(
        "menu.show",
        this.items,
        this.templates,
        0,
        0,
        menuSkin
      );
    };

    if (wnd.webContents.isLoading()) {
      wnd.webContents.once("did-finish-load", sendData);
    } else {
      sendData();
    }
  }
}
