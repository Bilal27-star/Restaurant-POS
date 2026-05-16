/**
 * Fails the build if `tauri.conf.json` is not valid JSON or cannot be parsed.
 * Run first in `beforeBuildCommand` so Tauri never receives a broken config.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const confPath = path.join(__dirname, "..", "tauri.conf.json");

const raw = fs.readFileSync(confPath, "utf8");
try {
  JSON.parse(raw);
} catch (e) {
  console.error(`validate-tauri-config: invalid JSON in ${confPath}`);
  console.error(e);
  process.exit(1);
}
console.log("validate-tauri-config: OK", confPath);
