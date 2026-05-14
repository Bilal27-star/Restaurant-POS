import cookieParser from "cookie-parser";
import express from "express";
import helmet from "helmet";
import hpp from "hpp";

import type { Env } from "./config/env.js";
import { createRootLogger, createDomainLogger } from "./config/logger.js";
import { createErrorHandler } from "./core/errors/errorHandler.js";
import { sendSuccess } from "./core/http/response.js";
import { createCorsMiddleware } from "./middleware/cors.js";
import { createHttpLogger } from "./middleware/httpLogger.js";
import { notFoundHandler } from "./middleware/notFound.js";
import { createAuthRateLimiter, createDefaultRateLimiter } from "./middleware/rateLimit.js";
import { requestIdMiddleware } from "./middleware/requestId.js";
import { sanitizeRequestMiddleware } from "./middleware/sanitizeRequest.js";
import { buildV1Router } from "./routes/v1/index.js";

export type AppInstance = {
  app: express.Express;
  rootLogger: ReturnType<typeof createRootLogger>;
  paymentLogger: ReturnType<typeof createDomainLogger>;
  shiftLogger: ReturnType<typeof createDomainLogger>;
};

export function createHttpApplication(env: Env): AppInstance {
  const rootLogger = createRootLogger(env);
  const paymentLogger = createDomainLogger(rootLogger, "payments");
  const shiftLogger = createDomainLogger(rootLogger, "shifts");

  const app = express();
  app.set("trust proxy", env.TRUST_PROXY ? 1 : false);
  app.disable("x-powered-by");

  app.use(requestIdMiddleware);
  app.use(helmet());
  app.use(createCorsMiddleware(env));
  app.use(hpp());
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: true, limit: "1mb" }));
  app.use(cookieParser());
  app.use(sanitizeRequestMiddleware(env));

  const httpLogger = createHttpLogger(rootLogger, env);
  app.use(httpLogger);

  app.get("/health", (_req, res) => {
    sendSuccess(res, { status: "ok" }, { message: "Service healthy" });
  });

  const globalLimiter = createDefaultRateLimiter(env);
  const authLimiter = createAuthRateLimiter(env);
  const v1Router = buildV1Router({ env, authLimiter });

  app.use(env.API_BASE_PATH, globalLimiter, v1Router);

  app.use(notFoundHandler);
  app.use(createErrorHandler(rootLogger));

  return { app, rootLogger, paymentLogger, shiftLogger };
}
