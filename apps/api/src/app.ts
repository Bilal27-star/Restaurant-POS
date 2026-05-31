import cookieParser from "cookie-parser";
import express from "express";
import helmet from "helmet";
import hpp from "hpp";

import { isAuthThrottleDisabled } from "./config/desktop-runtime.js";
import type { Env } from "./config/env.js";
import { createRootLogger, createDomainLogger } from "./config/logger.js";
import { createErrorHandler } from "./core/errors/errorHandler.js";
import { createCorsMiddleware, privateNetworkAccessMiddleware } from "./middleware/cors.js";
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
  app.use(privateNetworkAccessMiddleware);
  app.use(createCorsMiddleware(env));
  app.use(hpp());
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: true, limit: "1mb" }));
  app.use(cookieParser());
  app.use(sanitizeRequestMiddleware(env));

  const httpLogger = createHttpLogger(rootLogger, env);
  app.use(httpLogger);

  if (isAuthThrottleDisabled(env)) {
    rootLogger.info(
      { auth_throttle_disabled_desktop: true, nodeEnv: env.NODE_ENV, posDesktopRuntime: env.POS_DESKTOP_RUNTIME },
      "HTTP rate limiting and account lockout disabled for local desktop/offline API",
    );
  }

  /** Plain body for probes (`curl`, Tauri); not the JSON envelope used by `/api/v1`. */
  app.get("/health", (_req, res) => {
    res.status(200).type("application/json").json({ status: "ok" });
  });

  const globalLimiter = createDefaultRateLimiter(env, rootLogger);
  const authLimiter = createAuthRateLimiter(env, rootLogger);
  const v1Router = buildV1Router({ env, authLimiter });

  app.use(env.API_BASE_PATH, globalLimiter, v1Router);

  app.use(notFoundHandler);
  app.use(createErrorHandler(rootLogger));

  return { app, rootLogger, paymentLogger, shiftLogger };
}
