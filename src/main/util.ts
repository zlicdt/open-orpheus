import { resolve, join, normalize } from "node:path";
import os from "node:os";

import { BrowserWindow, screen } from "electron";

export async function pngFromIco(icoData: Uint8Array): Promise<Uint8Array> {
  const photon = await import("@silvia-odwyer/photon-node");
  const icoImage = photon.PhotonImage.new_from_byteslice(icoData);
  const pngData = icoImage.get_bytes();
  return pngData;
}

export function sanitizeRelativePath(
  base: string,
  path: string
): string | false {
  const resolvedBase = resolve(base);
  const normalizedPath = normalize(path);
  const resolvedPath = resolve(
    join(
      resolvedBase,
      os.platform() === "win32"
        ? normalizedPath
        : normalizedPath.replaceAll("\\", "/")
    )
  );
  if (!resolvedPath.startsWith(resolvedBase)) {
    return false;
  }
  return resolvedPath;
}

export function getWindowState(
  wnd: BrowserWindow
): "minimize" | "maximize" | "restore" {
  return wnd.isMinimized()
    ? "minimize"
    : wnd.isMaximized()
      ? "maximize"
      : "restore";
}

export function getWindowSizeStatus(
  wnd: BrowserWindow
): ["minimize" | "maximize" | "restore", number, number, number] {
  const bounds = wnd.getBounds();
  const screenScaleFactor = screen.getDisplayMatching(bounds).scaleFactor;
  // TODO: Confirm macOS desired behavior, Windows and Linux (Wayland) is already tested to be correct
  const scaleFactor = os.platform() === "win32" ? 1 : screenScaleFactor;
  return [
    getWindowState(wnd),
    bounds.width * scaleFactor,
    bounds.height * scaleFactor,
    screenScaleFactor,
  ];
}

export function getWindowScaleFactor(wnd: BrowserWindow): number {
  const bounds = wnd.getBounds();
  return screen.getDisplayMatching(bounds).scaleFactor;
}
