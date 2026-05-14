/**
 * Socket.IO layer: JWT handshake, permission-scoped tenant rooms, connection lifecycle.
 * Offline-first: clients may send `auth.syncClientId` for a future sync engine (logged only).
 */
import type { Server as HttpServer } from "node:http";
import { Server } from "socket.io";
import type { Logger } from "pino";

import type { Env } from "../config/env.js";
import { JwtTokenService } from "../core/auth/jwt.service.js";
import { getCorsOriginOption } from "../middleware/cors.js";
import { RealtimeEvents } from "./events.js";
import { extractAccessTokenFromSocket } from "./extract-socket-token.js";
import { joinRoomsForSocket, RealtimeHub } from "./realtime-hub.js";
import { registerRealtimeHub } from "./registry.js";

export function attachRealtimeLayer(httpServer: HttpServer, env: Env, log: Logger): { shutdown: () => void } {
  const jwt = new JwtTokenService(env);
  const corsOrigin = getCorsOriginOption(env);

  const io = new Server(httpServer, {
    path: "/socket.io",
    serveClient: false,
    cors: {
      origin: corsOrigin,
      credentials: true,
    },
    /** Small POS payloads: skip per-message deflate to reduce CPU under load. */
    perMessageDeflate: false,
    pingTimeout: 60_000,
    pingInterval: 25_000,
    connectTimeout: 45_000,
  });

  const hub = new RealtimeHub(io, log);
  registerRealtimeHub(hub);

  io.engine.on("connection_error", (err) => {
    log.warn({ err: String(err.message) }, "realtime engine connection error");
  });

  io.use((socket, next) => {
    const token = extractAccessTokenFromSocket(socket);
    if (!token) {
      return next(new Error("Unauthorized"));
    }
    try {
      const payload = jwt.verifyAccessToken(token);
      const rawAuth = socket.handshake.auth;
      const syncClientId =
        rawAuth && typeof rawAuth === "object" && typeof (rawAuth as { syncClientId?: unknown }).syncClientId === "string"
          ? (rawAuth as { syncClientId: string }).syncClientId
          : undefined;
      if (syncClientId) {
        log.debug({ syncClientId: syncClientId.slice(0, 12) }, "realtime sync client hint (reserved)");
      }
      socket.data.realtime = {
        userId: payload.sub,
        restaurantId: payload.rid,
        permissions: payload.permissions,
      };
      return next();
    } catch (e) {
      log.warn({ err: String(e) }, "realtime socket auth failed");
      return next(new Error("Unauthorized"));
    }
  });

  io.on("connection", (socket) => {
    const ctx = socket.data.realtime;
    if (!ctx) {
      socket.disconnect(true);
      return;
    }
    log.info({ socketId: socket.id, userId: ctx.userId, restaurantId: ctx.restaurantId }, "realtime socket connected");
    joinRoomsForSocket(socket, log, ctx.restaurantId, ctx.permissions);

    socket.on(RealtimeEvents.SYNC_HELLO, (msg: unknown) => {
      log.debug({ socketId: socket.id, msg }, "realtime sync hello (no-op; reserved for desktop sync)");
    });

    socket.on("disconnect", (reason) => {
      log.info({ socketId: socket.id, userId: ctx.userId, reason }, "realtime socket disconnected");
    });

    socket.on("error", (err) => {
      log.error({ err: String(err), socketId: socket.id }, "realtime socket error");
    });
  });

  const shutdown = () => {
    registerRealtimeHub(null);
    io.disconnectSockets(true);
    io.close();
    log.info("realtime layer shut down");
  };

  return { shutdown };
}