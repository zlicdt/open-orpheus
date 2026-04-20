declare module "electron-installer-common" {
  export type CatchableFunction = (err: Error) => void;

  export type UserSuppliedOptions = {
    src?: string;
    options?: Record<string, unknown>;
  } & Record<string, unknown>;

  export class ElectronInstaller {
    userSupplied: UserSuppliedOptions;
    defaults: Record<string, unknown>;
    options: Record<string, unknown>;
    stagingDir: string;
    packagePattern: string;

    constructor(userSupplied: UserSuppliedOptions);

    get appIdentifier(): string;
    get baseAppDir(): string;
    get contentFunctions(): string[];
    get defaultDesktopTemplatePath(): string;
    get pixmapIconPath(): string;
    get sourceDir(): string | undefined;
    get stagingAppDir(): string;

    copyApplication(
      ignoreFunc?: (src: string) => boolean | Promise<boolean>
    ): Promise<void>;
    copyHicolorIcons(): Promise<void>;
    copyIcon(src: string, dest: string): Promise<void>;
    copyLicense(copyrightFile: string): Promise<void>;
    copyLinuxIcons(): Promise<void>;
    copyPixmapIcon(): Promise<void>;
    createBinarySymlink(): Promise<void>;
    createContents(): Promise<void>;
    createCopyright(): Promise<void>;
    createDesktopFile(): Promise<void>;
    createStagingDir(): Promise<void>;
    createTemplatedFile(
      templatePath: string,
      dest: string,
      filePermissions?: number
    ): Promise<void>;
    generateOptions(): void;
    movePackage(): Promise<void>;
    updateSandboxHelperPermissions(): Promise<void>;

    [key: string]: unknown;
  }

  export function createDesktopFile(
    templatePath: string,
    dir: string,
    baseName: string,
    options: Record<string, unknown>
  ): Promise<void>;
  export function createTemplatedFile(
    templatePath: string,
    dest: string,
    options: Record<string, unknown>,
    filePermissions?: number
  ): Promise<void>;
  export function errorMessage(message: string, err: Error): string;
  export function generateTemplate(
    templatePath: string,
    data: Record<string, unknown>
  ): Promise<string>;
  export function getDefaultsFromPackageJSON(
    pkg: Record<string, unknown>,
    fallbacks?: Record<string, unknown>
  ): Record<string, unknown>;
  export function getHomePage(pkg: Record<string, unknown>): string;
  export function hasSandboxHelper(appDir: string): Promise<boolean>;
  export function readElectronVersion(appDir: string): Promise<string>;
  export function readMetadata(options: {
    logger: (msg: string) => void;
    src: string;
  }): Promise<Record<string, unknown>>;
  export function replaceScopeName(name?: string, divider?: string): string;
  export function sanitizeName(
    name: string,
    allowedCharacterRange: string,
    replacement?: string
  ): string;
  export function updateSandboxHelperPermissions(appDir: string): Promise<void>;
  export function wrapError(message: string): CatchableFunction;
  export function wrapError(
    message: string,
    wrappedFunction: () => Promise<void>
  ): Promise<void>;
}
