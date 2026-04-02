import { dirname, resolve } from "node:path";
import { readdir, readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

async function runBuildCommand(modulePath: string, script: string) {
  return new Promise<{ status: number | null }>((resolve, reject) => {
    const buildProcess = spawn(
      "pnpm",
      ["run", script],
      {
        cwd: modulePath,
        stdio: "inherit",
        shell: true,
      }
    );

    buildProcess.on("error", (err) => {
      reject(err);
    });

    buildProcess.on("exit", (code) => {
      resolve({ status: code });
    });
  });
}

interface ModuleInfo {
  dirName: string;
  packageName: string;
  path: string;
  workspaceDeps: string[];
  scripts: Record<string, string>;
}

async function readModuleInfos(modulesDir: string, moduleNames: string[]): Promise<ModuleInfo[]> {
  return Promise.all(
    moduleNames.map(async (dirName) => {
      const modulePath = resolve(modulesDir, dirName);
      const pkg = JSON.parse(await readFile(resolve(modulePath, "package.json"), "utf-8"));
      const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
      const workspaceDeps = Object.entries(allDeps)
        .filter(([, ver]) => (ver as string).startsWith("workspace:"))
        .map(([name]) => name);
      return { dirName, packageName: pkg.name as string, path: modulePath, workspaceDeps, scripts: (pkg.scripts ?? {}) as Record<string, string> };
    })
  );
}

function topoSort(modules: ModuleInfo[]): ModuleInfo[] {
  const nameToModule = new Map(modules.map((m) => [m.packageName, m]));
  const sorted: ModuleInfo[] = [];
  const visited = new Set<string>();
  const visiting = new Set<string>();

  function visit(mod: ModuleInfo) {
    if (visited.has(mod.packageName)) return;
    if (visiting.has(mod.packageName)) {
      throw new Error(`Circular dependency detected involving ${mod.packageName}`);
    }
    visiting.add(mod.packageName);
    for (const dep of mod.workspaceDeps) {
      const depMod = nameToModule.get(dep);
      if (depMod) visit(depMod);
    }
    visiting.delete(mod.packageName);
    visited.add(mod.packageName);
    sorted.push(mod);
  }

  for (const mod of modules) visit(mod);
  return sorted;
}

async function buildModules() {
  const modulesDir = resolve(dirname(fileURLToPath(import.meta.url)), "../modules");
  const moduleNames = await readdir(modulesDir);
  const modules = await readModuleInfos(modulesDir, moduleNames);
  const sorted = topoSort(modules);
  const preferScript = process.env.PREFER_SCRIPT;

  for (const mod of sorted) {
    const script = preferScript && mod.scripts[preferScript] ? preferScript : "build";
    console.log(`Building module: ${mod.dirName} (${mod.packageName}) [${script}]`);
    const result = await runBuildCommand(mod.path, script);
    if (result.status !== 0) {
      console.error(`Failed to build module: ${mod.dirName}`);
      process.exit(1);
    }
  }
}

buildModules();
