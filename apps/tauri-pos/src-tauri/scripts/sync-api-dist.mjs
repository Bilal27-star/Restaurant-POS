/**
 * Copies `apps/api/dist` into `resources/bundled-api/dist` before `tauri build`
 * (cross-platform; avoids relying on rsync on Windows).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const apiDist = path.resolve(__dirname, "../../../api/dist");
const dest = path.resolve(__dirname, "../resources/bundled-api/dist");

if (!fs.existsSync(apiDist)) {
  console.error(`sync-api-dist: missing API build output: ${apiDist}`);
  process.exit(1);
}

fs.rmSync(dest, { recursive: true, force: true });
fs.mkdirSync(path.dirname(dest), { recursive: true });
fs.cpSync(apiDist, dest, { recursive: true });
console.log(`sync-api-dist: ${apiDist} -> ${dest}`);
