import path from "node:path";
import { fileURLToPath } from "node:url";

import dotenv from "dotenv";

/** `apps/api` package root (valid from `src/` and compiled `dist/`). */
export function resolveApiPackageRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
}

/** Load `apps/api/.env` before `loadEnv()` / HTTP bind (cwd-independent). */
export function loadApiDotenv(): void {
  const root = resolveApiPackageRoot();
  dotenv.config({ path: path.join(root, ".env") });
  dotenv.config({ path: path.join(root, ".env.local") });
}
