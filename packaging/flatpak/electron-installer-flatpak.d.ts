declare module "@malept/electron-installer-flatpak" {
  import { ElectronInstaller } from "electron-installer-common";

  namespace installer {
    interface FlatpakRefs {
      baseFlatpakref: string;
      runtimeFlatpakref: string;
      sdkFlatpakref: string;
    }

    interface InstallerData {
      src: string;
      dest: string;
      arch?: string;
      id?: string;
      bin?: string;
      branch?: string;
      base?: string;
      baseVersion?: string;
      runtime?: string;
      runtimeVersion?: string;
      sdk?: string;
      icon?: string | Record<string, unknown>;
      files?: Array<[string, string]>;
      symlinks?: Array<[string, string]>;
      extraFlatpakBuilderArgs?: string[];
      finishArgs?: string[];
      modules?: Array<Record<string, unknown>>;
      rename?: (dest: string, src: string) => string;
      logger?: (message: string) => void;
      [key: string]: unknown;
    }

    interface InstallerResult extends InstallerData {
      id: string;
      arch: string;
      bin: string;
      branch: string;
      base: string;
      baseVersion: string;
      runtime: string;
      runtimeVersion: string;
      sdk: string;
      finishArgs: string[];
      modules: Array<Record<string, unknown>>;
    }

    class Installer extends ElectronInstaller {
      constructor(data: InstallerData);

      get appIdentifier(): string;
      get baseAppDir(): string;
      get contentFunctions(): string[];
      get defaultDesktopTemplatePath(): string;
      get flatpakrefs(): FlatpakRefs;
      get resourcesDir(): string;

      createBinWrapper(): Promise<void>;
      createDesktopFile(): Promise<void>;
      determineBaseRuntimeAndSDK(): Promise<{
        branch: string;
        baseVersion: string;
        runtime: string;
        sdk: string;
        runtimeVersion: string;
        base: string;
      }>;
      generateDefaults(): Promise<InstallerData>;
      requiresSandboxWrapper(): Promise<boolean>;
      createBundle(): Promise<unknown>;
    }
  }

  function installer(
    data: installer.InstallerData
  ): Promise<installer.InstallerResult>;

  export = installer;
}
