import { normalize, sep } from "node:path";

import unzipper from "unzipper";

export default abstract class Pack {
  protected path: string;
  protected files: Map<string, unzipper.File> = new Map();

  protected _isLoaded = false;

  get fileList(): string[] {
    return Array.from(this.files.keys());
  }

  get isLoaded(): boolean {
    return this._isLoaded;
  }

  constructor(path: string) {
    this.path = path;
  }

  protected normalizePath(path: string): string {
    if (!path.startsWith("\\") && !path.startsWith("/")) {
      path = sep + path;
    }
    return normalize(path);
  }

  abstract readPack(verify?: boolean): Promise<void>;
  abstract readFile(path: string): Promise<Buffer>;
}
