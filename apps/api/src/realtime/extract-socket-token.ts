import type { Socket } from "socket.io";

export function extractAccessTokenFromSocket(socket: Socket): string | null {
  const rawAuth = socket.handshake.auth;
  if (rawAuth && typeof rawAuth === "object") {
    const token = (rawAuth as { token?: unknown }).token;
    if (typeof token === "string") {
      const t = token.trim();
      if (t) {
        return t;
      }
    }
  }
  const authHeader = socket.handshake.headers.authorization;
  if (typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
    const t = authHeader.slice("Bearer ".length).trim();
    return t || null;
  }
  return null;
}
