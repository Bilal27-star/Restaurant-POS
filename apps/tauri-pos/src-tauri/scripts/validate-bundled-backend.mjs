/**
 * Fails early if the packaged backend resources are missing.
 *
 * Required after installation (Tauri bundle resources):
 *   - resources/bundled-api/
 *   - resources/node-runtime/
 *   - resources/desktop-runtime.js
 *
 * Also required for runtime:
 *   - resources/bundled-api/dist/desktop-runtime.js
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const srcTauriRoot = path.join(__dirname, "..");
const resources = path.join(srcTauriRoot, "resources");

function fail(msg) {
  console.error(`validate-bundled-backend: ${msg}`);
  process.exit(1);
}

function exists(p) {
  try {
    fs.accessSync(p, fs.constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function isFile(p) {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

function isDir(p) {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

const requiredDirs = [
  path.join(resources, "bundled-api"),
  path.join(resources, "node-runtime"),
];

for (const p of requiredDirs) {
  if (!isDir(p)) fail(`missing directory ${p}`);
}

const bundledRuntime = path.join(resources, "bundled-api", "dist", "desktop-runtime.js");
if (!isFile(bundledRuntime)) {
  fail(
    `missing bundled runtime ${bundledRuntime}\n` +
      "Fix: run `node apps/tauri-pos/src-tauri/scripts/package-bundled-backend.mjs` before `tauri build`.",
  );
}

const ordersValidation = path.join(resources, "bundled-api", "dist", "modules", "orders", "orders.validation.js");
if (!isFile(ordersValidation)) {
  fail(`missing bundled orders validation ${ordersValidation}`);
}
const ordersValidationSrc = fs.readFileSync(ordersValidation, "utf8");
if (!/waiterName:\s*z\.string/.test(ordersValidationSrc)) {
  fail(
    "bundled-api orders.validation.js is stale: createOrderBody must accept optional waiterName. " +
      "Run `node apps/tauri-pos/src-tauri/scripts/package-bundled-backend.mjs` after `pnpm --filter @pos/api run build`.",
  );
}

const topLevelRuntime = path.join(resources, "desktop-runtime.js");
if (!isFile(topLevelRuntime)) {
  try {
    fs.copyFileSync(bundledRuntime, topLevelRuntime);
  } catch (e) {
    fail(`missing ${topLevelRuntime} and failed to create it: ${e instanceof Error ? e.message : String(e)}`);
  }
}

const nodeBin = path.join(resources, "node-runtime", "bin");
if (!isDir(nodeBin)) fail(`missing directory ${nodeBin}`);

const nodeExe = process.platform === "win32" ? path.join(nodeBin, "node.exe") : path.join(nodeBin, "node");
if (!isFile(nodeExe)) fail(`missing node runtime binary ${nodeExe}`);

console.log("validate-bundled-backend: OK");

