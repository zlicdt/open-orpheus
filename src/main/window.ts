import { app, BrowserWindow, shell } from "electron";

import AppMenu from "./menu";

type WindowProperties = {
  id?: string;
  maximumSize?: { x: number; y: number };
  minimumSize?: { x: number; y: number };
  menus: Map<number, AppMenu>;
  customProps: Record<string, unknown>;
};

export let mainWindow: BrowserWindow | null = null;

export function setMainWindow(wnd: BrowserWindow) {
  mainWindow = wnd;
}

const windowProperties = new Map<number, WindowProperties>();

function shouldRespectSizeConstraints(wnd: BrowserWindow) {
  return !wnd.isMaximized() && !wnd.isFullScreen();
}

function enableSizeConstraints(wnd: BrowserWindow) {
  const props = windowProperties.get(wnd.id);
  if (props?.maximumSize) {
    wnd.setMaximumSize(props.maximumSize.x, props.maximumSize.y);
  }
  if (props?.minimumSize) {
    wnd.setMinimumSize(props.minimumSize.x, props.minimumSize.y);
  }
}

function disableSizeConstraints(wnd: BrowserWindow) {
  const props = windowProperties.get(wnd.id);
  if (props?.maximumSize) {
    wnd.setMaximumSize(0, 0);
  }
  if (props?.minimumSize) {
    wnd.setMinimumSize(0, 0);
  }
}

app.on("browser-window-created", (event, wnd) => {
  windowProperties.set(wnd.id, {
    menus: new Map(),
    customProps: {},
  });
  wnd.on("closed", () => {
    windowProperties.delete(wnd.id);
  });

  wnd.on("maximize", () => {
    disableSizeConstraints(wnd);
  });

  wnd.on("unmaximize", () => {
    enableSizeConstraints(wnd);
  });

  wnd.on("enter-full-screen", () => {
    disableSizeConstraints(wnd);
  });

  wnd.on("leave-full-screen", () => {
    enableSizeConstraints(wnd);
  });

  wnd.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http://") || url.startsWith("https://")) {
      shell.openExternal(url);
    }
    return { action: "deny" };
  });
});

// Web pack identify windows by a custom string id.
export function setWindowId(wnd: BrowserWindow, id: string) {
  const props = windowProperties.get(wnd.id);
  if (props) {
    props.id = id;
  }
}

export function getWindowId(wnd: BrowserWindow): string | undefined {
  const props = windowProperties.get(wnd.id);
  return props ? props.id : undefined;
}

export function getWindowById(id: string): BrowserWindow | undefined {
  for (const [wndId, props] of windowProperties.entries()) {
    if (props.id === id) {
      return BrowserWindow.fromId(wndId);
    }
  }
  return undefined;
}

export function setMaximumSize(wnd: BrowserWindow, x: number, y: number) {
  x = Math.round(x);
  y = Math.round(y);
  if (shouldRespectSizeConstraints(wnd)) {
    wnd.setMaximumSize(x, y);
  }
  const props = windowProperties.get(wnd.id);
  if (props) {
    props.maximumSize = { x, y };
  }
}

export function setMinimumSize(wnd: BrowserWindow, x: number, y: number) {
  x = Math.round(x);
  y = Math.round(y);
  if (shouldRespectSizeConstraints(wnd)) {
    wnd.setMinimumSize(x, y);
  }
  const props = windowProperties.get(wnd.id);
  if (props) {
    props.minimumSize = { x, y };
  }
}

export function getMenus(wnd: BrowserWindow): Map<number, AppMenu> {
  const props = windowProperties.get(wnd.id);
  return props ? props.menus : new Map();
}

export function setWindowProp<T>(wnd: BrowserWindow, prop: string, value: T) {
  const customProps = windowProperties.get(wnd.id).customProps;
  customProps[prop] = value;
}

export function getWindowProp<T>(wnd: BrowserWindow, prop: string): T {
  const customProps = windowProperties.get(wnd.id).customProps;
  return customProps[prop] as T;
}
