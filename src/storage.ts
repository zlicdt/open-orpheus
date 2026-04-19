import { ipcRenderer } from "electron";

type KvValue = string | Uint8Array;

export const get = (key: string): Promise<KvValue | null> =>
  ipcRenderer.invoke("kv.get", key);

export const set = (key: string, value: KvValue): Promise<void> =>
  ipcRenderer.invoke("kv.set", key, value);

export const has = (key: string): Promise<boolean> =>
  ipcRenderer.invoke("kv.has", key);

export const del = (key: string): Promise<boolean> =>
  ipcRenderer.invoke("kv.delete", key);

export const clear = (): Promise<void> => ipcRenderer.invoke("kv.clear");

export const setJson = (key: string, value: unknown): Promise<void> =>
  ipcRenderer.invoke("kv.setJson", key, value);

export const getJson = <T>(key: string): Promise<T | null> =>
  ipcRenderer.invoke("kv.getJson", key);
