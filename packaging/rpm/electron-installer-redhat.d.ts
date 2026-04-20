declare module "electron-installer-redhat" {
  import { ElectronInstaller } from "electron-installer-common";

  export class Installer extends ElectronInstaller {
    get contentFunctions(): string[];
    get specPath(): string;

    constructor(options: object);

    generateDefaults(): Promise<unknown>;
    generateOptions(): Promise<unknown>;
    generateScripts(): Promise<unknown>;
    createStagingDir(): Promise<unknown>;
    createContents(): Promise<unknown>;
    createPackage(): Promise<unknown>;
    movePackage(): Promise<unknown>;

    copyLinuxIcons(): Promise<void>;
    createBinarySymlink(): Promise<void>;
    createCopyright(): Promise<void>;
    createDesktopFile(): Promise<void>;
    createSpec(): Promise<void>;

    [key: string]: unknown;
  }
}
