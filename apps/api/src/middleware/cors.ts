import cors from "cors";
import type { RequestHandler } from "express";

import type { Env } from "../config/env.js";

/**
 * Chrome / WebView2 Private Network Access: Tauri (`http://tauri.localhost`) → LAN API (`http://192.168.x.x`)
 * sends OPTIONS with `Access-Control-Request-Private-Network: true`; login fails without this response header.
 */
export const privateNetworkAccessMiddleware: RequestHandler = (req, res, next) => {
  if (req.get("Access-Control-Request-Private-Network") === "true") {
    res.setHeader("Access-Control-Allow-Private-Network", "true");
  }
  next();
};

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
