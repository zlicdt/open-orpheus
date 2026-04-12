import { app } from "electron";
import { resolve } from "node:path";

export const data = resolve(app.isPackaged ? app.getPath("userData") : "data");

export const pack = resolve(data, "package");
export const userdata = resolve(data, "userdata");
export const storage = resolve(data, "storage");
export const wasm = resolve(data, "wasm");

export const cache = resolve(data, "cache");
export const lyricCache = resolve(cache, "lyrics");
export const httpCache = resolve(cache, "http");
export const playCache = resolve(cache, "play");
