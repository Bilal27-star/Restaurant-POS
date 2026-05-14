import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";

import { pinoHttp } from "pino-http";

import type { Env } from "../config/env.js";
import type { RootLogger } from "../config/logger.js";

export function createHttpLogger(rootLogger: RootLogger, env: Env) {
  return pinoHttp({
    logger: rootLogger.child({ domain: "http" }),
    genReqId: (req: IncomingMessage) => {
      const id = (req as IncomingMessage & { requestId?: string }).requestId;
      if (id && id.length > 0) {
        return id;
      }
      const header = req.headers["x-request-id"];
      if (typeof header === "string" && header.length > 0) {
        return header;
      }
      return randomUUID();
    },
    customLogLevel: (_req: IncomingMessage, res: ServerResponse, err?: Error) => {
      if (res.statusCode >= 500 || err) {
        return "error";
      }
      if (res.statusCode >= 400) {
        return "warn";
      }
      return env.LOG_LEVEL === "debug" ? "debug" : "info";
    },
    serializers: {
      req(req: IncomingMessage) {
        return {
          method: req.method,
          url: req.url,
          id: (req as IncomingMessage & { id?: string }).id,
        };
      },
      res(res: ServerResponse) {
        return { statusCode: res.statusCode };
      },
    },
  });
}
