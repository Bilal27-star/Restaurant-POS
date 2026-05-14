import { createServer } from "node:http";

import "dotenv/config";

import { createHttpApplication } from "./app.js";
import { loadEnv } from "./config/env.js";
import { createDomainLogger } from "./config/logger.js";
import { disconnectPrisma } from "./prisma/index.js";
import { attachRealtimeLayer } from "./realtime/realtime-server.js";
import { ensureDemoTenantIfEmpty } from "./bootstrap/ensure-demo-data.js";

const env = loadEnv();
const { app, rootLogger } = createHttpApplication(env);
const realtimeLogger = createDomainLogger(rootLogger, "realtime");

const httpServer = createServer(app);
const { shutdown: shutdownRealtime } = attachRealtimeLayer(httpServer, env, realtimeLogger);

await ensureDemoTenantIfEmpty(env, rootLogger);

httpServer.listen(env.PORT, () => {
  rootLogger.info({ port: env.PORT, env: env.NODE_ENV }, "HTTP server listening");
});

function shutdown(signal: string) {
  rootLogger.info({ signal }, "Shutting down");
  shutdownRealtime();
  httpServer.close(() => {
    void disconnectPrisma().finally(() => {
      process.exit(0);
    });
  });
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
