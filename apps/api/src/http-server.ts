import { createServer, type Server } from "node:http";

import type { Env } from "./config/env.js";
import { createHttpApplication } from "./app.js";
import { createDomainLogger } from "./config/logger.js";
import { disconnectPrisma } from "./prisma/index.js";
import { attachRealtimeLayer } from "./realtime/realtime-server.js";
import { ensureDemoTenantIfEmpty } from "./bootstrap/ensure-demo-data.js";

/** Shared HTTP stack for `server.ts` (dev) and `desktop-runtime.ts` (Tauri embedded API). */
export async function startPosHttpServer(env: Env): Promise<{
  httpServer: Server;
  gracefulShutdown: (signal: string) => Promise<void>;
}> {
  const { app, rootLogger } = createHttpApplication(env);
  const realtimeLogger = createDomainLogger(rootLogger, "realtime");
  const httpServer = createServer(app);
  const { shutdown: shutdownRealtime } = attachRealtimeLayer(httpServer, env, realtimeLogger);

  await ensureDemoTenantIfEmpty(env, rootLogger);

  await new Promise<void>((resolve, reject) => {
    httpServer.once("error", reject);
    httpServer.listen(env.PORT, () => {
      rootLogger.info({ port: env.PORT, env: env.NODE_ENV }, "HTTP server listening");
      resolve();
    });
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
