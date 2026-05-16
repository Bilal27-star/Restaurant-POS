/** @deprecated Use `apps/tauri-pos/scripts/ensure-bundled-backend-dev.mjs` (canonical). */
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const canonical = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../scripts/ensure-bundled-backend-dev.mjs",
);
execFileSync(process.execPath, [canonical], { stdio: "inherit" });
