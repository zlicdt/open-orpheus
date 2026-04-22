import os from "node:os";

import { Menu, NativeImage, Tray } from "electron";

import { mainWindow } from "./window";
import { kvGet } from "./kv";

let icon: NativeImage | null = null;
let tooltip: string | null = null;
let menu: Menu | null = null;

let trayIcon: Tray | null = null;

export function get(): Tray | null {
  return trayIcon;
}

export function setIcon(newIcon: NativeImage) {
  icon = newIcon;
  if (trayIcon) {
    trayIcon.setImage(newIcon);
  }
}

export function setTooltip(newTooltip: string) {
  tooltip = newTooltip;
  if (trayIcon) {
    trayIcon.setToolTip(newTooltip);
  }
}

export function setMenu(newMenu: Menu | null) {
  menu = newMenu;
  if (trayIcon) {
    trayIcon.setContextMenu(newMenu);
  }
}

export function install() {
  if (trayIcon) {
    throw new Error("Tray icon already installed");
  }
  if (!icon) {
    throw new Error("Tray icon not initialized");
  }
  trayIcon = new Tray(icon);
  if (tooltip) {
    trayIcon.setToolTip(tooltip);
  }
  if (menu) {
    trayIcon.setContextMenu(menu);
  }
  trayIcon.on("click", () => {
    if (!mainWindow) return;
    // Linux can only receives click, so a different behavior is used
    // The `onclick` will be send when main window is invisible, and `onrightclick` will be send when main window is visible
    mainWindow.webContents.send(
      "channel.call",
      // We only send rightclick here if is Linux, the main window is visible, and the user has not set the click behavior to "with-native-menu",
      // or, on Linux, if the user has set the click behavior to "always-show-menu", in which case we always send rightclick to show the menu
      os.platform() !== "linux" ||
        (kvGet("tray.clickBehavior") !== "always-show-menu" &&
          !mainWindow.isVisible()) ||
        kvGet("tray.clickBehavior") === "with-native-menu"
        ? "trayicon.onclick"
        : "trayicon.onrightclick"
    );
  });
  trayIcon.on("right-click", () => {
    if (!mainWindow) return;
    mainWindow.webContents.send("channel.call", "trayicon.onrightclick");
  });
}

export function uninstall() {
  if (!trayIcon) {
    throw new Error("Tray icon not installed");
  }
  trayIcon.destroy();
  trayIcon = null;
}
