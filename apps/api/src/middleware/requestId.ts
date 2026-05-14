import { randomUUID } from "node:crypto";

import type { NextFunction, Request, Response } from "express";

export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const headerId = typeof req.headers["x-request-id"] === "string" ? req.headers["x-request-id"] : undefined;
  const requestId = headerId?.trim() || randomUUID();
  req.requestId = requestId;
  res.setHeader("x-request-id", requestId);
  next();
}
