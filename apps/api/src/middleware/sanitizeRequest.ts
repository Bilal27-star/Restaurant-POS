import type { NextFunction, Request, Response } from "express";

import type { Env } from "../config/env.js";

/**
 * JSON APIs rely on Zod (strict shapes), Prisma (parameterized queries), and `hpp` for query pollution.
 * Extend this hook later if you add HTML rendering or non-JSON content types.
 */
export function sanitizeRequestMiddleware(_env: Env) {
  return (_req: Request, _res: Response, next: NextFunction): void => {
    next();
  };
}
