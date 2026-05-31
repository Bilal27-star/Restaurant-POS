import { createServer, type Server } from "node:http";

import type { Env } from "./config/env.js";
import { createHttpApplication } from "./app.js";
import { createDomainLogger } from "./config/logger.js";
import { disconnectPrisma } from "./prisma/index.js";
import { attachRealtimeLayer } from "./realtime/realtime-server.js";
import { clearAuthThrottleStateIfDesktop } from "./bootstrap/clear-auth-throttle-state.js";
import { ensureInitialTenantIfEmpty } from "./bootstrap/ensure-initial-tenant.js";

/** Shared HTTP stack for `server.ts` (dev) and `desktop-runtime.ts` (Tauri embedded API). */
export async function startPosHttpServer(env: Env): Promise<{
  httpServer: Server;
  gracefulShutdown: (signal: string) => Promise<void>;
}> {
  const { app, rootLogger } = createHttpApplication(env);
  const realtimeLogger = createDomainLogger(rootLogger, "realtime");
  const httpServer = createServer(app);
  const { shutdown: shutdownRealtime } = attachRealtimeLayer(httpServer, env, realtimeLogger);

  await clearAuthThrottleStateIfDesktop(env, rootLogger);
  const { adminStatus } = await ensureInitialTenantIfEmpty(env, rootLogger);
  console.log(adminStatus === "created" ? "[BOOT] admin created" : "[BOOT] admin exists");

  const listenHost = env.LISTEN_HOST?.trim() || process.env.LISTEN_HOST?.trim() || "0.0.0.0";

  await new Promise<void>((resolve, reject) => {
    const onError = (err: NodeJS.ErrnoException) => {
      httpServer.off("error", onError);
      if (err.code === "EADDRINUSE") {
        reject(
          new Error(
            `HTTP listen failed: port ${env.PORT} is already in use on ${listenHost}. Close the other process using this port.`,
          ),
        );
        return;
      }
      reject(err);
    };
    httpServer.once("error", onError);
    httpServer.listen(env.PORT, listenHost, () => {
      httpServer.off("error", onError);

      rootLogger.info(
        {
          port: env.PORT,
          host: listenHost,
          env: env.NODE_ENV,
          health: `http://${listenHost}:${env.PORT}/health`,
        },
        "HTTP server listening",
      );

      console.log(`API listening on:\nhttp://${listenHost}:${env.PORT}`);

      resolve();
    });
  });

  httpServer.on("clientError", (err) => {
    rootLogger.warn({ err }, "HTTP client error");
  });

  async function gracefulShutdown(signal: string) {
    rootLogger.info({ signal }, "Shutting down");
    shutdownRealtime();
    await new Promise<void>((r) => {
      httpServer.close(() => r());
    });
    await disconnectPrisma();
  }

  return { httpServer, gracefulShutdown };
}
