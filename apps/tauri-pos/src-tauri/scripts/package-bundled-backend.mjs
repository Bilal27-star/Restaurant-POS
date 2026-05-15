/**
 * Production desktop backend bundle — run before `tauri build` (see `tauri.conf.json` `beforeBuildCommand`).
 *
 * Produces a fully self-contained `resources/bundled-api/`:
 *   - `dist/` (compiled API + desktop-runtime)
 *   - `packages/database` + `packages/contracts` (vendored sources, no workspace:*)
 *   - `node_modules/` from `npm install --omit=dev` (no pnpm workspace)
 *   - Prisma client generated for this tree (`prisma generate`)
 *   - `resources/node-runtime/bin/` — official Node binary for the **host** OS/arch (macOS arm64/x64, Windows x64)
 *
 * After installation, only `resource_dir` + app data are needed — no monorepo paths.
 *
 * Usage (from repo root or any cwd):
 *   node apps/tauri-pos/src-tauri/scripts/package-bundled-backend.mjs
 *
 * Flags:
 *   --skip-api-build   Skip `pnpm --filter @pos/api run build` (e.g. if you already built).
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../../../../");
const resources = path.join(root, "apps/tauri-pos/src-tauri/resources");
const bundledApi = path.join(resources, "bundled-api");
const apiRoot = path.join(root, "apps/api");
const nodeBinDir = path.join(resources, "node-runtime", "bin");

const NODE_VER = process.env.DESKTOP_NODE_VERSION ?? "20.18.1";

const skipApiBuild = process.argv.includes("--skip-api-build");

function stripVendoredNoise(pkgDir) {
  for (const name of ["node_modules", "dist", ".turbo", "target"]) {
    const p = path.join(pkgDir, name);
    if (fs.existsSync(p)) fs.rmSync(p, { recursive: true, force: true });
  }
}

function copyTreeFiltered(src, dest) {
  fs.rmSync(dest, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.cpSync(src, dest, { recursive: true });
  stripVendoredNoise(dest);
}

function removeWorkspaceDeps(obj = {}) {
  const result = {};
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === "string" && v.includes("workspace:")) continue;
    result[k] = v;
  }
  return result;
}

function ensureApiBuilt() {
  if (skipApiBuild) {
    console.log("package-bundled-backend: --skip-api-build set, skipping API tsc");
    return;
  }
  execFileSync("pnpm", ["--filter", "@pos/api", "run", "build"], {
    cwd: root,
    stdio: "inherit",
  });
}

function writeBundledApi() {
  fs.rmSync(bundledApi, { recursive: true, force: true });
  fs.mkdirSync(bundledApi, { recursive: true });

  const pkg = JSON.parse(fs.readFileSync(path.join(apiRoot, "package.json"), "utf8"));
  pkg.dependencies = removeWorkspaceDeps(pkg.dependencies || {});
  pkg.devDependencies = {};
  pkg.peerDependencies = removeWorkspaceDeps(pkg.peerDependencies || {});
  pkg.optionalDependencies = removeWorkspaceDeps(pkg.optionalDependencies || {});
  delete pkg.workspaces;

  pkg.dependencies["@pos/database"] = "file:./packages/database";
  pkg.dependencies["@pos/contracts"] = "file:./packages/contracts";
  if (!pkg.dependencies["embedded-postgres"]) {
    pkg.dependencies["embedded-postgres"] = "18.3.0-beta.17";
  }

  fs.writeFileSync(path.join(bundledApi, "package.json"), `${JSON.stringify(pkg, null, 2)}\n`);

  const distSrc = path.join(apiRoot, "dist");
  if (!fs.existsSync(path.join(distSrc, "desktop-runtime.js"))) {
    console.error(
      "package-bundled-backend: apps/api/dist/desktop-runtime.js missing. Run `pnpm --filter @pos/api run build` or remove --skip-api-build.",
    );
    process.exit(1);
  }
  fs.cpSync(distSrc, path.join(bundledApi, "dist"), { recursive: true });

  const localPackagesDir = path.join(bundledApi, "packages");
  fs.mkdirSync(localPackagesDir, { recursive: true });
  copyTreeFiltered(path.join(root, "packages/database"), path.join(localPackagesDir, "database"));
  copyTreeFiltered(path.join(root, "packages/contracts"), path.join(localPackagesDir, "contracts"));

  for (const name of ["database", "contracts"]) {
    const p = path.join(localPackagesDir, name, "package.json");
    if (!fs.existsSync(p)) continue;
    const sub = JSON.parse(fs.readFileSync(p, "utf8"));
    if (sub.dependencies) sub.dependencies = removeWorkspaceDeps(sub.dependencies);
    if (sub.devDependencies) sub.devDependencies = removeWorkspaceDeps(sub.devDependencies);
    if (sub.peerDependencies) sub.peerDependencies = removeWorkspaceDeps(sub.peerDependencies);
    if (sub.optionalDependencies) sub.optionalDependencies = removeWorkspaceDeps(sub.optionalDependencies);
    delete sub.workspaces;
    fs.writeFileSync(p, `${JSON.stringify(sub, null, 2)}\n`);
  }

  const envExample = path.join(apiRoot, ".env.example");
  if (fs.existsSync(envExample)) {
    fs.copyFileSync(envExample, path.join(bundledApi, ".env"));
  }

  console.log("package-bundled-backend: npm install --omit=dev in bundled-api…");
  execFileSync("npm", ["install", "--omit=dev", "--no-audit", "--no-fund", "--loglevel=error"], {
    cwd: bundledApi,
    stdio: "inherit",
    env: { ...process.env, npm_config_engine_strict: "false" },
  });

  const prismaSchema = path.join(bundledApi, "packages/database/prisma/schema.prisma");
  const prismaCli = path.join(bundledApi, "node_modules", "prisma", "build", "index.js");
  if (!fs.existsSync(prismaCli)) {
    console.error("package-bundled-backend: prisma CLI not found at", prismaCli);
    process.exit(1);
  }
  console.log("package-bundled-backend: prisma generate…");
  execFileSync(
    process.execPath,
    [prismaCli, "generate", "--schema", prismaSchema],
    {
      cwd: path.join(bundledApi, "packages/database"),
      stdio: "inherit",
      env: {
        ...process.env,
        DATABASE_URL:
          process.env.DATABASE_URL ??
          "postgresql://postgres:postgres@127.0.0.1:5432/pos_prisma_placeholder?schema=public",
      },
    },
  );
}

function nodeDistBaseName() {
  const plat = process.platform;
  const arch = process.arch;
  if (plat === "win32") return `node-v${NODE_VER}-win-x64`;
  if (plat === "darwin") {
    if (arch === "arm64") return `node-v${NODE_VER}-darwin-arm64`;
    return `node-v${NODE_VER}-darwin-x64`;
  }
  throw new Error(
    `package-bundled-backend: unsupported host for embedded Node (${plat} ${arch}). Install Node on PATH and add resources manually, or extend this script.`,
  );
}

async function downloadEmbeddedNode() {
  fs.rmSync(nodeBinDir, { recursive: true, force: true });
  fs.mkdirSync(nodeBinDir, { recursive: true });

  const base = nodeDistBaseName();
  const isWin = process.platform === "win32";
  const archiveName = isWin ? `${base}.zip` : `${base}.tar.gz`;
  const url = `https://nodejs.org/dist/v${NODE_VER}/${archiveName}`;

  const tmp = path.join(resources, ".desktop-node-dl");
  fs.rmSync(tmp, { recursive: true, force: true });
  fs.mkdirSync(tmp, { recursive: true });
  const archivePath = path.join(tmp, archiveName);

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to download Node ${url} (${res.status})`);
  fs.writeFileSync(archivePath, Buffer.from(await res.arrayBuffer()));

  if (isWin) {
    execFileSync("tar", ["-xf", archivePath, "-C", tmp], { stdio: "inherit" });
  } else {
    execFileSync("tar", ["-xzf", archivePath, "-C", tmp], { stdio: "inherit" });
  }

  const extracted = path.join(tmp, base);
  if (isWin) {
    const nodeExe = path.join(extracted, "node.exe");
    if (!fs.existsSync(nodeExe)) throw new Error(`Missing ${nodeExe}`);
    fs.copyFileSync(nodeExe, path.join(nodeBinDir, "node.exe"));
    fs.copyFileSync(nodeExe, path.join(nodeBinDir, "node"));
  } else {
    const nodeBin = path.join(extracted, "bin", "node");
    if (!fs.existsSync(nodeBin)) throw new Error(`Missing ${nodeBin}`);
    fs.copyFileSync(nodeBin, path.join(nodeBinDir, "node"));
    try {
      fs.chmodSync(path.join(nodeBinDir, "node"), 0o755);
    } catch {
      /* ignore */
    }
  }

  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`package-bundled-backend: embedded Node ${base} -> ${nodeBinDir}`);
}

ensureApiBuilt();
writeBundledApi();
await downloadEmbeddedNode();
console.log("package-bundled-backend: done");
