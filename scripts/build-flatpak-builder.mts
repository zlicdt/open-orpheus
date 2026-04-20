import { execFile as execFileCb, spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { tmpdir } from "node:os";

const execFile = promisify(execFileCb);
import yaml from "yaml";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "..");

const pkg = JSON.parse(
  await readFile(resolve(projectRoot, "package.json"), "utf-8")
);
const { flatpak: flatpakOptions } = await import(
  new URL("../packaging/options.ts", import.meta.url).href
);

const electronVersion: string = pkg.devDependencies.electron;
const outDir = resolve(projectRoot, "out/make/flatpak-builder");

// --- Step 1: Create a minimal fake app dir for electron-installer-redhat ---
// It needs: version file, resources/app/package.json, and a fake binary
const fakeAppDir = await mkdtemp(resolve(tmpdir(), "fake-electron-app-"));
await writeFile(resolve(fakeAppDir, "version"), electronVersion);
await mkdir(resolve(fakeAppDir, "resources/app"), { recursive: true });
await writeFile(
  resolve(fakeAppDir, "resources/app/package.json"),
  JSON.stringify({
    name: pkg.name,
    version: pkg.version,
    description: flatpakOptions.description,
    license: flatpakOptions.license,
    homepage: flatpakOptions.homepage,
    productName: flatpakOptions.productName,
  })
);
console.log("Created fake app dir at", fakeAppDir);
// Copy LICENSE so createCopyright can find it
await cp(resolve(projectRoot, "LICENSE"), resolve(fakeAppDir, "LICENSE"));
// Create a dummy chrome-sandbox so requiresSandboxWrapper() returns true.
// This causes the installer to generate the electron-wrapper script (zypak-wrapper call)
// and set the desktop Exec to it, matching how the real maker handles sandboxing.
await writeFile(resolve(fakeAppDir, "chrome-sandbox"), "");

const { Installer } = await import("@malept/electron-installer-flatpak");

const installer = new Installer({
  ...flatpakOptions,
  // Resolve icon path relative to project root
  icon: resolve(projectRoot, flatpakOptions.icon as string),
  src: fakeAppDir,
  dest: outDir,
  arch: "noarch", // builder is arch-independent
  logger: () => {},
});

await installer.generateDefaults();
await installer.generateOptions();
await installer.createStagingDir();

// Run content functions except copyApplication — we don't have a real app
for (const fn of installer.contentFunctions) {
  if (fn === "copyApplication") continue;
  await (installer[fn] as () => Promise<void>)();
}

// Process the `files` option — electron-installer-flatpak only uses this in createBundle()
// which we skip, so we copy the files into staging ourselves.
for (const [src, dest] of (flatpakOptions.files ?? []) as [string, string][]) {
  const srcAbs = resolve(projectRoot, src);
  // dest is an absolute path within the flatpak app dir (e.g. /share/icons/...)
  const destAbs = resolve(
    installer.stagingDir,
    installer.baseAppDir,
    dest.replace(/^\//, "")
  );
  await mkdir(dirname(destAbs), { recursive: true });
  await cp(srcAbs, destAbs);
}

// --- Step 2: Copy staging dir contents to out as scaffolding/ ---
const scaffoldingDir = resolve(outDir, "scaffolding");
await mkdir(outDir, { recursive: true }); // may already exist from prior runs
await cp(installer.stagingDir, scaffoldingDir, { recursive: true });
console.log("Scaffolding copied to", scaffoldingDir);

// --- Step 2.5: Fetch pnpm tarball and compute sha256 for offline sandbox install ---
const packageManagerField = (pkg.packageManager ?? "") as string;
const pnpmVersionMatch = packageManagerField.match(
  /^pnpm@([^+]+)\+sha512\.([a-f0-9]+)/
);
if (!pnpmVersionMatch) {
  throw new Error(
    `Cannot determine pnpm version/sha512 from packageManager field: ${packageManagerField}`
  );
}
const pnpmVersion = pnpmVersionMatch[1];
const pnpmSha512 = pnpmVersionMatch[2];
const pnpmTarballName = `pnpm-${pnpmVersion}.tgz`;
const pnpmTarballUrl = `https://registry.npmjs.org/pnpm/-/pnpm-${pnpmVersion}.tgz`;
console.log(`Using pnpm ${pnpmVersion} with sha512 from packageManager field.`);

// --- Step 3: Generate pnpm offline sources via flatpak-node-generator ---
const nodeSourcesFile = resolve(outDir, "generated-node-sources.json");
console.log("Running flatpak-node-generator for pnpm...");
await execFile("flatpak-node-generator", [
  "--electron-node-headers",
  "pnpm",
  resolve(projectRoot, "pnpm-lock.yaml"),
  "-o",
  nodeSourcesFile,
]);
console.log("flatpak-node-generator done.");

// --- Step 3.5: Generate Cargo vendor sources via flatpak-cargo-generator ---
const cargoSourcesFile = resolve(outDir, "generated-cargo-sources.json");
console.log("Running flatpak-cargo-generator for Cargo...");
await execFile("flatpak-cargo-generator", [
  resolve(projectRoot, "Cargo.lock"),
  "-o",
  cargoSourcesFile,
]);
console.log("flatpak-cargo-generator done.");

// --- Step 4: Create project source tarball ---
const { name: pkgName, version: pkgVersion } = pkg as {
  name: string;
  version: string;
};
const sourceTarball = `${pkgName}-${pkgVersion}.tar.gz`;
const sourceTarballPath = resolve(outDir, sourceTarball);
console.log(`Creating project source tarball: ${sourceTarball}`);
// Use git ls-files to get all tracked + untracked-but-not-ignored files
// (reads current disk state, so uncommitted edits are included)
const { stdout: nullSeparatedFiles } = await execFile(
  "git",
  ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
  { cwd: projectRoot, maxBuffer: 10 * 1024 * 1024 }
);
await new Promise<void>((res, rej) => {
  const tar = spawn(
    "tar",
    [
      "czf",
      sourceTarballPath,
      "--null",
      "--no-recursion",
      "--transform",
      `s,^,${pkgName}-${pkgVersion}/,`,
      "-C",
      projectRoot,
      "-T",
      "-",
    ],
    { cwd: projectRoot }
  );
  tar.on("error", rej);
  tar.on("close", (code) =>
    code === 0 ? res() : rej(new Error(`tar exited with code ${code}`))
  );
  tar.stdin.end(nullSeparatedFiles);
});

// --- Step 5: Generate Flatpak builder YAML manifest ---
type InstallerOptions = {
  id: string;
  bin: string;
  base: string;
  baseVersion: string | number;
  runtime: string;
  runtimeVersion: string | number;
  sdk: string;
  branch: string;
  finishArgs: string[];
  modules: Record<string, unknown>[];
  name: string;
};
const opts = installer.options as InstallerOptions;
const appIdentifier = (installer as unknown as { appIdentifier: string })
  .appIdentifier;

const appModule = {
  name: appIdentifier,
  buildsystem: "simple",
  "build-options": {
    // Make SDK extension binaries and our npm-global-installed pnpm available for all build
    // commands. FLATPAK_BUILDER_BUILDDIR is always /run/build/{module-name} in the sandbox.
    "append-path": `/usr/lib/sdk/node24/bin:/usr/lib/sdk/rust-stable/bin:/run/build/${appIdentifier}/.npm-prefix/bin`,
    env: {
      XDG_CACHE_HOME: `/run/build/${appIdentifier}/flatpak-node/cache`,
      ELECTRON_OFFLINE_BUILD: "1",
    },
  },
  "build-commands": [
    // Install scaffolding (desktop file, icons, copyright, electron-wrapper) into /app
    "install -d /app",
    "cp -r scaffolding/. /app/",

    // Point cargo at the vendored sources generated by flatpak-cargo-generator
    "mkdir -p .cargo",
    "cp cargo/config .cargo/config",

    // Install pnpm into the (writable) build dir using FLATPAK_BUILDER_BUILDDIR
    `npm install -g --prefix $FLATPAK_BUILDER_BUILDDIR/.npm-prefix ./${pnpmTarballName}`,

    // Install dependencies using the offline pnpm store populated by flatpak-node-generator.
    `pnpm install --offline --frozen-lockfile --store-dir $FLATPAK_BUILDER_BUILDDIR/flatpak-node/pnpm-store`,
    `pnpm run build:modules`,

    // Package the Electron app
    `pnpm run package`,

    // Install the built Electron app into /app/lib/{name}
    `install -d /app/lib/${appIdentifier}`,
    `bash -c 'cp -r out/${pkg.name}-linux-*/. /app/lib/${appIdentifier}/'`,

    // Create the /app/bin symlink
    "install -d /app/bin",
    `ln -sf /app/lib/${appIdentifier}/${opts.bin} /app/bin/${opts.bin}`,
  ],
  sources: [
    "generated-node-sources.json",
    {
      type: "file",
      url: pnpmTarballUrl,
      sha512: pnpmSha512,
      "dest-filename": pnpmTarballName,
    },
    "generated-cargo-sources.json",
    {
      type: "archive",
      path: sourceTarball,
      "strip-components": 1,
    },
    {
      type: "dir",
      path: "scaffolding",
      dest: "scaffolding",
    },
  ],
};

const manifest = {
  "app-id": opts.id,
  "sdk-extensions": [
    "org.freedesktop.Sdk.Extension.node24",
    "org.freedesktop.Sdk.Extension.rust-stable",
  ],
  runtime: opts.runtime,
  "runtime-version": String(opts.runtimeVersion),
  sdk: opts.sdk,
  base: opts.base,
  "base-version": String(opts.baseVersion),
  // When sandbox wrapper is needed, the installer sets desktopExec to 'electron-wrapper'
  // and generates that script in staging. Use it as the manifest command too.
  command: installer.options.desktopExec ?? opts.bin,
  "separate-locales": false,
  "finish-args": opts.finishArgs,
  modules: [...opts.modules, appModule],
};

const doc = yaml.parseDocument(yaml.stringify(manifest));

// The project dir source follows nodeSources + pnpm tarball + cargoSources
const manifestPath = resolve(outDir, `${opts.id}.yml`);
await writeFile(manifestPath, doc.toString());

// --- Step 6: Clean up fake app dir ---
await rm(fakeAppDir, { recursive: true, force: true });

console.log("Flatpak builder manifest written to:");
console.log(`  ${manifestPath}`);
