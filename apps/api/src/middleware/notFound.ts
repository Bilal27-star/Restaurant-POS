import type { NextFunction, Request, Response } from "express";

import { ApiError } from "../core/http/ApiError.js";

export function notFoundHandler(req: Request, _res: Response, next: NextFunction): void {
  next(ApiError.notFound(`No route for ${req.method} ${req.originalUrl}`));
}
