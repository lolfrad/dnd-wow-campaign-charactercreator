import { spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { createServer } from "node:net";
import { createRequire } from "node:module";
import { readFileSync, existsSync } from "node:fs";
import {
  mkdir,
  open,
  readFile,
  readdir,
  realpath,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = await realpath(
  resolve(dirname(fileURLToPath(import.meta.url)), "../.."),
);
const appRoot = join(root, "app");
const cache = join(root, ".cache", "launcher");
const recordFile = join(cache, "server.json");
const lockFile = join(cache, "launch.lock");
const logFile = join(cache, "launcher.log");
const serverLog = join(cache, "server.log");
const buildFile = join(cache, "build.json");
const dependencyFile = join(cache, "dependencies.json");
const requireApp = createRequire(join(appRoot, "package.json"));
const projectId = createHash("sha256")
  .update(root.toLowerCase())
  .digest("hex")
  .slice(0, 24);
const flags = new Set(process.argv.slice(2));
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const environment = {
  ...Object.fromEntries(
    Object.entries(process.env).filter(([key]) => key.toLowerCase() !== "path"),
  ),
  Path: `${dirname(process.execPath)};${process.env.PATH ?? process.env.Path ?? ""}`,
};
let ownsLock = false;
await mkdir(cache, { recursive: true });

async function readJson(path) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return null;
  }
}
async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}
async function log(message) {
  console.log(message);
  await writeFile(logFile, `[${new Date().toISOString()}] ${message}\n`, {
    flag: "a",
  });
}
async function digestFiles(files) {
  const hash = createHash("sha256");
  for (const file of files.sort()) {
    hash.update(file);
    hash.update(await readFile(join(root, file)));
  }
  return hash.digest("hex");
}
async function sourceFiles(directory) {
  const result = [];
  for (const item of await readdir(join(root, directory), {
    withFileTypes: true,
  })) {
    const file = `${directory}/${item.name}`;
    if (item.isDirectory()) result.push(...(await sourceFiles(file)));
    else if (item.isFile()) result.push(file);
  }
  return result;
}
function alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
function validPort(port) {
  return Number.isInteger(port) && port >= 1024 && port <= 65535;
}
async function health(record) {
  if (
    !record ||
    record.projectId !== projectId ||
    !validPort(record.port) ||
    !Number.isInteger(record.pid) ||
    record.pid <= 0
  )
    return null;
  try {
    const response = await fetch(`http://127.0.0.1:${record.port}/api/health`, {
      signal: AbortSignal.timeout(1500),
    });
    if (!response.ok) return null;
    const value = await response.json();
    return value.app === "azeroth-token-forge" &&
      value.projectId === projectId &&
      value.pid === record.pid
      ? value
      : null;
  } catch {
    return null;
  }
}
async function acquireLock() {
  const started = Date.now();
  while (Date.now() - started < 300000) {
    try {
      const file = await open(lockFile, "wx");
      await file.writeFile(JSON.stringify({ pid: process.pid }));
      await file.close();
      ownsLock = true;
      return;
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      const owner = await readJson(lockFile);
      const age =
        Date.now() -
        (await stat(lockFile).catch(() => ({ mtimeMs: Date.now() }))).mtimeMs;
      if ((owner?.pid && !alive(owner.pid)) || age > 600000) {
        await unlink(lockFile).catch(() => {});
        continue;
      }
      await pause(500);
    }
  }
  throw new Error(
    "Another launch is still preparing the workshop. See .cache/launcher/launcher.log.",
  );
}
async function stop(record) {
  const current = await health(record);
  if (!current) {
    await log("Token Forge is already stopped.");
    return;
  }
  if (!current.managed || typeof record.controlToken !== "string")
    throw new Error(
      "This server was started outside the launcher. Close its original terminal to stop it.",
    );
  const response = await fetch(
    `http://127.0.0.1:${record.port}/api/launcher/shutdown`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${record.controlToken}` },
      signal: AbortSignal.timeout(5000),
    },
  );
  if (!response.ok)
    throw new Error(
      "The local server rejected the stop request. Its process was left untouched.",
    );
  for (let count = 0; count < 40; count++) {
    if (!(await health(record))) break;
    await pause(250);
  }
  await writeFile(
    recordFile,
    JSON.stringify(
      { projectId, port: record.port, stoppedAt: new Date().toISOString() },
      null,
      2,
    ),
  );
  await log(
    "Token Forge stopped. Double-click Launch Token Forge.cmd to return.",
  );
}
async function runNode(args, cwd = root) {
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      cwd,
      env: environment,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    child.stdout.on("data", (data) => {
      process.stdout.write(data);
      void writeFile(logFile, data, { flag: "a" });
    });
    child.stderr.on("data", (data) => {
      process.stderr.write(data);
      void writeFile(logFile, data, { flag: "a" });
    });
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0
        ? resolve()
        : reject(
            new Error(
              `Setup command failed (exit ${code}). See .cache/launcher/launcher.log.`,
            ),
          ),
    );
  });
}
function packageRoot(name) {
  try {
    return dirname(requireApp.resolve(`${name}/package.json`));
  } catch {
    /* Some packages hide package.json through exports. */
  }
  let directory = dirname(requireApp.resolve(name));
  while (dirname(directory) !== directory) {
    try {
      if (
        JSON.parse(readFileSync(join(directory, "package.json"), "utf8"))
          .name === name
      )
        return directory;
    } catch {
      /* continue upwards */
    }
    directory = dirname(directory);
  }
  throw new Error(`Could not locate the installed ${name} package.`);
}
function dependenciesAvailable() {
  try {
    for (const name of [
      "typescript",
      "vite",
      "tsx",
      "sirv",
      "jquery",
      "sharp",
      "csv-parse",
      "ffmpeg-static",
    ])
      packageRoot(name);
    requireApp("sharp");
    if (!existsSync(requireApp("ffmpeg-static"))) return false;
    return true;
  } catch {
    return false;
  }
}
async function prepareDependencies() {
  const hash = await digestFiles([
    "package.json",
    "package-lock.json",
    "app/package.json",
  ]);
  if (
    (await readJson(dependencyFile))?.hash === hash &&
    dependenciesAvailable()
  )
    return;
  await log(
    "Installing project dependencies. This is only needed for first setup or dependency updates.",
  );
  const npm = join(
    dirname(process.execPath),
    "node_modules",
    "npm",
    "bin",
    "npm-cli.js",
  );
  if (!(await exists(npm)))
    throw new Error(
      "Portable npm is missing. Remove .runtime and launch again to restore the official Node.js package.",
    );
  // npm ci operates only on this checkout's node_modules directories.
  for (const target of [
    join(root, "node_modules"),
    join(appRoot, "node_modules"),
  ]) {
    const canonical = await realpath(target).catch(() => resolve(target));
    if (!canonical.toLowerCase().startsWith((root + sep).toLowerCase()))
      throw new Error("Dependency directory must stay inside this project.");
  }
  await runNode([
    npm,
    "ci",
    "--include=dev",
    "--no-audit",
    "--no-fund",
    "--loglevel=error",
  ]);
  const encoder = requireApp("ffmpeg-static");
  if (!encoder || !(await exists(encoder)))
    await runNode(
      [join(packageRoot("ffmpeg-static"), "install.js")],
      packageRoot("ffmpeg-static"),
    );
  if (!dependenciesAvailable())
    throw new Error("Dependencies are still incomplete after installation.");
  await writeFile(dependencyFile, JSON.stringify({ hash }));
}
async function prepareBuild(hash) {
  if (
    (await readJson(buildFile))?.hash === hash &&
    (await exists(join(appRoot, "dist", "index.html")))
  )
    return;
  await log("Preparing the website...");
  await runNode(
    [join(packageRoot("typescript"), "bin", "tsc"), "--noEmit"],
    appRoot,
  );
  await runNode(
    [join(packageRoot("vite"), "bin", "vite.js"), "build"],
    appRoot,
  );
  await writeFile(buildFile, JSON.stringify({ hash }));
}
async function portAvailable(port) {
  return new Promise((resolve) => {
    const probe = createServer();
    probe.once("error", () => resolve(false));
    probe.listen(port, "127.0.0.1", () => probe.close(() => resolve(true)));
  });
}
async function choosePort(preferred) {
  const candidates = [
    preferred,
    ...Array.from({ length: 21 }, (_, i) => 5173 + i),
  ].filter(
    (port, index, all) => validPort(port) && all.indexOf(port) === index,
  );
  for (const port of candidates) if (await portAvailable(port)) return port;
  throw new Error(
    "Local ports 5173-5193 are all occupied. Stop another local application and try again.",
  );
}
async function openBrowser(url) {
  if (flags.has("--no-browser")) return;
  await new Promise((resolve, reject) => {
    // Pass the URL through the environment: cmd.exe's quoting rules can leave
    // `start` waiting for input when Node escapes the embedded quote marks.
    const child = spawn(
      join(
        process.env.SystemRoot ?? "C:\\Windows",
        "System32",
        "WindowsPowerShell",
        "v1.0",
        "powershell.exe",
      ),
      [
        "-NoLogo",
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        "$env:PSModulePath = Join-Path $PSHOME 'Modules'; Start-Process -FilePath $env:FORGE_BROWSER_URL -WindowStyle Normal",
      ],
      {
        windowsHide: true,
        stdio: "ignore",
        env: { ...environment, FORGE_BROWSER_URL: url },
      },
    );
    let finished = false;
    const finish = (error) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      child.unref();
      error ? reject(error) : resolve();
    };
    const timer = setTimeout(() => {
      void log(
        `Browser opening is taking longer than expected. The website is ready at ${url}`,
      ).finally(() => finish());
    }, 15000);
    child.once("error", finish);
    child.once("exit", (code) =>
      finish(
        code === 0
          ? undefined
          : new Error(`Could not open the browser. Open ${url} manually.`),
      ),
    );
  });
}
async function main() {
  const [major] = process.versions.node.split(".").map(Number);
  if (major < 24)
    throw new Error(
      "Node.js 24 or later is required. Launch through Launch Token Forge.cmd to use the bundled runtime.",
    );
  await acquireLock();
  let record = await readJson(recordFile);
  if (flags.has("--stop")) {
    await stop(record);
    return;
  }
  const hash = await digestFiles([
    "package.json",
    "package-lock.json",
    "index.js",
    "setup.js",
    "character_modeling.js",
    "wow_model_viewer.js",
    "app/package.json",
    "app/index.html",
    "app/tsconfig.json",
    "app/previews.html",
    "app/vite.config.ts",
    ...(await sourceFiles("app/src")),
    ...(await sourceFiles("app/server")),
    ...(await sourceFiles("app/public")),
    ...(await sourceFiles("app/data")),
  ]);
  const current = await health(record);
  if (current?.sourceHash === hash) {
    const url = `http://127.0.0.1:${record.port}`;
    await log(`Token Forge is ready: ${url}`);
    await openBrowser(url);
    return;
  }
  if (current?.managed) await stop(record);
  await prepareDependencies();
  await prepareBuild(hash);
  const port = await choosePort(record?.port);
  const controlToken = randomBytes(32).toString("hex");
  const output = await open(serverLog, "a");
  await output.write(`\n[${new Date().toISOString()}] Starting Token Forge\n`);
  const child = spawn(
    process.execPath,
    [
      "--import",
      pathToFileURL(requireApp.resolve("tsx")).href,
      join(appRoot, "server", "index.ts"),
      "--production",
    ],
    {
      cwd: root,
      detached: true,
      windowsHide: true,
      env: {
        ...environment,
        PORT: String(port),
        FORGE_LAUNCHER_TOKEN: controlToken,
        FORGE_SOURCE_HASH: hash,
      },
      stdio: ["ignore", output.fd, output.fd],
    },
  );
  let spawnError;
  child.on("error", (error) => {
    spawnError = error;
  });
  await new Promise((resolve, reject) => {
    child.once("spawn", resolve);
    child.once("error", reject);
  });
  child.unref();
  await output.close();
  record = {
    projectId,
    pid: child.pid,
    port,
    controlToken,
    startedAt: new Date().toISOString(),
  };
  await writeFile(recordFile, JSON.stringify(record, null, 2));
  await log(
    "Starting the local asset server. Waiting until the website is ready...",
  );
  const started = Date.now();
  while (Date.now() - started < 180000) {
    if (spawnError || child.exitCode !== null) {
      const tail = (await readFile(serverLog, "utf8"))
        .split(/\r?\n/)
        .slice(-16)
        .join("\n");
      throw new Error(`The local server could not start.\n${tail}`);
    }
    const ready = await health(record);
    if (ready) {
      const url = `http://127.0.0.1:${port}`;
      await log(`Token Forge is ready: ${url}`);
      await openBrowser(url);
      return;
    }
    await pause(500);
  }
  if (child.exitCode === null) {
    try {
      child.kill("SIGTERM");
    } catch {
      /* already exited */
    }
  }
  throw new Error(
    "The server did not become ready within 3 minutes. See .cache/launcher/server.log for the exact error.",
  );
}
try {
  await main();
} catch (error) {
  await log(`ERROR: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
} finally {
  if (ownsLock) await unlink(lockFile).catch(() => {});
}
