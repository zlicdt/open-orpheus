import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import SevenZip from "7z-wasm";

import { pack as base } from "./folders";
import Pack from "./packs/Pack";
import WebPack from "./packs/WebPack";
import SkinPack from "./packs/SkinPack";

import versions from "../../versions.json";

function chooseWebPackFile() {
  const webPack = resolve(base, "web.pack");
  if (existsSync(webPack)) {
    return webPack;
  }
  const orpheusPack = resolve(base, "orpheus.ntpk");
  if (existsSync(orpheusPack)) {
    return orpheusPack;
  }
  throw new Error("No pack file found");
}

export type DownloadPackageProgress = {
  step: "downloading" | "extracting" | "saving" | "completed";
  downloadedBytes?: number;
  totalBytes?: number;
  progress?: number;
  file?: string;
  fileIndex?: number;
  fileCount?: number;
};

export class PackManager extends EventTarget {
  readonly packs: Map<string, Pack> = new Map();

  async loadWebPack() {
    const webPackPath = chooseWebPackFile();
    const wp = new WebPack(webPackPath);
    await wp.readPack();
    this.packs.set("web", wp);
    this.dispatchEvent(new Event("webpackloaded"));
  }

  async loadSkinPack(name: string, name2: string) {
    const loadOne = async (
      packKey: "skin" | "skin2",
      packName: string,
      eventName: "skinpackloaded" | "skin2packloaded"
    ) => {
      const skinPackPath = resolve(base, `${packName}.skin`);
      if (!existsSync(skinPackPath)) {
        throw new Error(`Skin pack file not found: ${skinPackPath}`);
      }
      const skinPack = new SkinPack(skinPackPath);
      await skinPack.readPack();
      this.packs.set(packKey, skinPack);
      this.dispatchEvent(new CustomEvent(eventName, { detail: packName }));
    };

    await loadOne("skin", name, "skinpackloaded");
    await loadOne("skin2", name2, "skin2packloaded");
  }

  getPack<T extends Pack>(pack: string): T {
    const p = this.packs.get(pack);
    if (!p) {
      throw new Error(`Pack not loaded: ${pack}`);
    }
    return p as T;
  }

  async getOrWaitPack<T extends Pack>(pack: string): Promise<T> {
    const p = this.packs.get(pack);
    if (p?.isLoaded) {
      return p as T;
    }
    return new Promise<T>((resolve) => {
      this.addEventListener(
        `${pack}packloaded`,
        () => resolve(this.packs.get(pack) as T),
        { once: true }
      );
    });
  }

  async downloadPackage(
    onProgress?: (progress: DownloadPackageProgress) => void
  ) {
    const files = ["common.skin", "dark.skin", "native.ntpk", "orpheus.ntpk"];

    onProgress?.({
      step: "downloading",
      downloadedBytes: 0,
      progress: 0,
    });

    const response = await fetch(versions.downloadUrl);
    if (!response.ok) {
      throw new Error(`Failed to download web pack: ${response.statusText}`);
    }

    const contentLength = response.headers.get("content-length");
    const totalBytes = contentLength
      ? Number.parseInt(contentLength, 10)
      : undefined;

    let buf: Buffer;
    if (response.body) {
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let downloadedBytes = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        if (!value) {
          continue;
        }

        chunks.push(value);
        downloadedBytes += value.byteLength;
        onProgress?.({
          step: "downloading",
          downloadedBytes,
          totalBytes,
          progress: totalBytes ? downloadedBytes / totalBytes : undefined,
        });
      }

      buf = Buffer.concat(chunks, downloadedBytes);
    } else {
      const arrayBuffer = await response.arrayBuffer();
      buf = Buffer.from(arrayBuffer);
      onProgress?.({
        step: "downloading",
        downloadedBytes: buf.length,
        totalBytes,
        progress: totalBytes ? buf.length / totalBytes : 1,
      });
    }

    const sevenZip = await SevenZip();

    const stream = sevenZip.FS.open("installer.exe", "w+");
    sevenZip.FS.write(stream, buf, 0, buf.length);
    sevenZip.FS.close(stream);

    onProgress?.({ step: "extracting" });

    sevenZip.callMain([
      "x",
      "installer.exe",
      ...files.map((f) => `package/${f}`),
    ]);

    onProgress?.({
      step: "saving",
      fileCount: files.length,
      fileIndex: 0,
    });

    await mkdir(base, { recursive: true }); // Ensure the base directory exists

    for (const [index, file] of files.entries()) {
      const destPath = resolve(base, file);
      const buf = sevenZip.FS.readFile(`package/${file}`);
      await writeFile(destPath, buf);
      onProgress?.({
        step: "saving",
        file,
        fileCount: files.length,
        fileIndex: index + 1,
        progress: (index + 1) / files.length,
      });
    }

    onProgress?.({ step: "completed", progress: 1 });
  }
}

const packManager = new PackManager();
export default packManager;
