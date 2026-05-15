/**
 * GitHub Actions / Windows: materialize `apps/tauri-pos/src-tauri/resources/bundled-api`
 * and embedded Node runtime so `tauri build` can bundle them (paths are gitignored).
 *
 * Vendors `packages/database` and `packages/contracts` under bundled-api so `npm install`
 * does not need pnpm workspaces. Run from repo root:
 *   node .github/scripts/prepare-tauri-windows-resources.mjs
 */

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");
const resources = path.join(root, "apps/tauri-pos/src-tauri/resources");
const bundledApi = path.join(resources, "bundled-api");
const apiRoot = path.join(root, "apps/api");
const nodeBinDir = path.join(resources, "node-runtime", "bin");

const NODE_WIN_VER = process.env.CI_NODE_WIN_X64_VERSION ?? "20.18.1";

function ensureApiBuilt() {
  execFileSync("pnpm", ["--filter", "@pos/api", "run", "build"], {
    cwd: root,
    stdio: "inherit",
  });
}

/** Drop any remaining workspace: specifiers (npm cannot resolve them outside a pnpm workspace). */
function removeWorkspaceDeps(obj = {}) {
  const result = {};
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === "string" && value.includes("workspace:")) {
      continue;
    }
    result[key] = value;
  }
  return result;
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

  // Self-contained copies under bundled-api (paths are relative to bundled-api/package.json).
  pkg.dependencies["@pos/database"] = "file:./packages/database";
  pkg.dependencies["@pos/contracts"] = "file:./packages/contracts";
  if (!pkg.dependencies["embedded-postgres"]) {
    pkg.dependencies["embedded-postgres"] = "18.3.0-beta.17";
  }

  fs.writeFileSync(path.join(bundledApi, "package.json"), `${JSON.stringify(pkg, null, 2)}\n`);

  const distSrc = path.join(apiRoot, "dist");
  if (!fs.existsSync(path.join(distSrc, "desktop-runtime.js"))) {
    console.error(
      "prepare-tauri-windows-resources: apps/api/dist/desktop-runtime.js missing — run `pnpm --filter @pos/api run build` first.",
    );
    process.exit(1);
  }
  fs.cpSync(distSrc, path.join(bundledApi, "dist"), { recursive: true });

  const localPackagesDir = path.join(bundledApi, "packages");
  fs.mkdirSync(localPackagesDir, { recursive: true });
  fs.cpSync(path.join(root, "packages/database"), path.join(localPackagesDir, "database"), {
    recursive: true,
  });
  fs.cpSync(path.join(root, "packages/contracts"), path.join(localPackagesDir, "contracts"), {
    recursive: true,
  });

  // Strip workspace:* from vendored packages so npm does not choke on nested installs.
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

  console.log("prepare-tauri-windows-resources: npm install (production) in bundled-api…");
  execFileSync("npm", ["install", "--omit=dev", "--no-audit", "--no-fund", "--loglevel=error"], {
    cwd: bundledApi,
    stdio: "inherit",
    env: { ...process.env, npm_config_engine_strict: "false" },
  });
}

async function downloadWindowsEmbeddedNode() {
  if (process.platform !== "win32") return;

  fs.rmSync(nodeBinDir, { recursive: true, force: true });
  fs.mkdirSync(nodeBinDir, { recursive: true });

  const zipName = `node-v${NODE_WIN_VER}-win-x64.zip`;
  const url = `https://nodejs.org/dist/v${NODE_WIN_VER}/${zipName}`;
  const tmp = path.join(resources, ".ci-node-dl");
  fs.rmSync(tmp, { recursive: true, force: true });
  fs.mkdirSync(tmp, { recursive: true });
  const zipPath = path.join(tmp, zipName);

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to download Node: ${url} (${res.status})`);
  }
  fs.writeFileSync(zipPath, Buffer.from(await res.arrayBuffer()));

  execFileSync("tar", ["-xf", zipPath, "-C", tmp], { stdio: "inherit" });

  const extracted = path.join(tmp, `node-v${NODE_WIN_VER}-win-x64`);
  const nodeExe = path.join(extracted, "node.exe");
  if (!fs.existsSync(nodeExe)) {
    throw new Error(`Expected ${nodeExe} after extracting ${zipName}`);
  }
  fs.copyFileSync(nodeExe, path.join(nodeBinDir, "node.exe"));
  fs.copyFileSync(nodeExe, path.join(nodeBinDir, "node"));

  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`prepare-tauri-windows-resources: embedded Node ${NODE_WIN_VER} -> ${nodeBinDir}`);
}

ensureApiBuilt();
writeBundledApi();
await downloadWindowsEmbeddedNode();
console.log("prepare-tauri-windows-resources: done");
