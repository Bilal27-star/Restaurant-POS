/**
 * Ensures `src-tauri/resources/bundled-api` exists before `tauri dev`.
 * Invoked from `tauri.conf.json` `beforeDevCommand` (cwd is usually `apps/tauri-pos`).
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const tauriPosRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(tauriPosRoot, "../..");
const bundledApi = path.join(tauriPosRoot, "src-tauri/resources/bundled-api");
const apiDist = path.join(repoRoot, "apps/api/dist/desktop-runtime.js");
const packageScript = path.join(tauriPosRoot, "src-tauri/scripts/package-bundled-backend.mjs");
const embeddedNode = path.join(tauriPosRoot, "src-tauri/resources/node-runtime/bin/node");

function isBrokenSymlink(p) {
  if (!fs.existsSync(p)) return true;
  try {
    if (fs.lstatSync(p).isSymbolicLink()) fs.realpathSync(p);
  } catch {
    return true;
  }
  return false;
}

function bundleLooksHealthy() {
  if (!fs.existsSync(path.join(bundledApi, "dist", "desktop-runtime.js"))) return false;
  if (!fs.existsSync(path.join(bundledApi, "packages", "database", "dist", "index.js"))) return false;
  if (!fs.existsSync(path.join(bundledApi, "packages", "contracts", "dist", "index.js"))) return false;
  if (!fs.existsSync(path.join(bundledApi, "node_modules", "prisma", "build", "index.js"))) return false;
  if (isBrokenSymlink(path.join(bundledApi, "node_modules", "@pos", "database"))) return false;
  if (isBrokenSymlink(path.join(bundledApi, "node_modules", "@pos", "contracts"))) return false;
  if (fs.existsSync(path.join(bundledApi, "node_modules", "@pos", "tsconfig"))) return false;
  if (!fs.existsSync(embeddedNode)) return false;
  return true;
}

function runPackageScript() {
  const args = [packageScript];
  if (fs.existsSync(apiDist)) args.push("--skip-api-build");
  console.log("ensure-bundled-backend-dev: packaging desktop API bundle…");
  execFileSync(process.execPath, args, { cwd: repoRoot, stdio: "inherit" });
}

if (!bundleLooksHealthy()) {
  runPackageScript();
  if (!bundleLooksHealthy()) {
    console.error("ensure-bundled-backend-dev: bundled-api still unhealthy after packaging");
    process.exit(1);
  }
  console.log("ensure-bundled-backend-dev: bundled-api ready");
} else {
  console.log("ensure-bundled-backend-dev: bundled-api ok");
}
