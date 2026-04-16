// This module is the CJS entry point for the library.

import os from "node:os";

// The Rust addon.
import * as addon from "./load.cjs";

// Use this declaration to assign types to the addon's exports,
// which otherwise by default are `any`.
declare module "./load.cjs" {
  function dragWindow(hwnd: Buffer): void;
  function isWayland(): boolean;
  function captureNextWindowFirstCursorEnter(
    callback: (x: number, y: number) => void
  ): void;
}

export function dragWindow(hwnd: Buffer): void {
  addon.dragWindow(hwnd);
}

export function isWayland(): boolean {
  if (os.platform() !== "linux") {
    throw new Error("isWayland is only supported on Linux");
  }
  return addon.isWayland();
}

export function captureNextWindowFirstCursorEnter(
  callback: (x: number, y: number) => void
): void {
  if (os.platform() !== "linux") {
    throw new Error(
      "captureNextWindowFirstCursorEnter is only supported on Linux"
    );
  }
  addon.captureNextWindowFirstCursorEnter(callback);
}
