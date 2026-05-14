import type { NextFunction, Request, Response } from "express";
import { Prisma } from "@prisma/client";
import jwt from "jsonwebtoken";
import { ZodError } from "zod";

import { ApiError } from "../http/ApiError.js";
import { sendError } from "../http/response.js";
import { mapPrismaClientError, mapPrismaValidationError } from "./prismaErrors.js";
import type { RootLogger } from "../../config/logger.js";

function zodToDetails(err: ZodError) {
  return {
    issues: err.issues.map((i) => ({
      path: i.path.join("."),
      message: i.message,
      code: i.code,
    })),
  };
}

export function createErrorHandler(rootLogger: RootLogger) {
  return (err: unknown, req: Request, res: Response, _next: NextFunction): void => {
    const log = req.log ?? rootLogger.child({ requestId: req.requestId });

    if (err instanceof ZodError) {
      const api = ApiError.badRequest("Validation failed", zodToDetails(err));
      log.warn({ err: api, requestId: req.requestId }, api.message);
      sendError(res, api.statusCode, api.message, api.details);
      return;
    }

    if (err instanceof ApiError) {
      const level = err.statusCode >= 500 ? "error" : "warn";
      log[level]({ err, requestId: req.requestId }, err.message);
      sendError(res, err.statusCode, err.message, err.details);
      return;
    }

    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      const api = mapPrismaClientError(err);
      log.error({ err, requestId: req.requestId }, api.message);
      sendError(res, api.statusCode, api.message, api.details);
      return;
    }

    if (err instanceof Prisma.PrismaClientValidationError) {
      const api = mapPrismaValidationError(err);
      log.warn({ err: api, requestId: req.requestId }, api.message);
      sendError(res, api.statusCode, api.message, api.details);
      return;
    }

    if (err instanceof jwt.TokenExpiredError) {
      log.warn({ err, requestId: req.requestId }, "JWT expired");
      sendError(res, 401, "Token expired");
      return;
    }

    if (err instanceof jwt.JsonWebTokenError) {
      log.warn({ err, requestId: req.requestId }, "JWT invalid");
      sendError(res, 401, "Invalid token");
      return;
    }

    log.error({ err, requestId: req.requestId }, "Unhandled error");
    sendError(res, 500, "Internal server error");
  };
}
