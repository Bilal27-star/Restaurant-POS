import cors from "cors";

import type { Env } from "../config/env.js";

/** Shared with Socket.IO so browser clients use the same origin policy as REST. */
export function getCorsOriginOption(env: Env): boolean | string[] {
  const origins =
    env.CORS_ORIGINS?.split(",")
      .map((s) => s.trim())
      .filter(Boolean) ?? [];

  /** Empty list: reflect request `Origin` so Vite dev, Tauri webviews, and local LAN POS clients work without a static allowlist. */
  return origins.length > 0 ? origins : true;
}

export function createCorsMiddleware(env: Env) {
  const originOption = getCorsOriginOption(env);

  return cors({
    origin: originOption,
    credentials: true,
  });
}
