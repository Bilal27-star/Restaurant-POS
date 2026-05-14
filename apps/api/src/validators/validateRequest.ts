import type { NextFunction, Request, RequestHandler, Response } from "express";
import type { z, ZodTypeAny } from "zod";

type RequestPart = "body" | "query" | "params";

function parsePart(req: Request, part: RequestPart): unknown {
  if (part === "body") {
    return req.body;
  }
  if (part === "query") {
    return req.query;
  }
  return req.params;
}

export function validateRequest<T extends ZodTypeAny>(part: RequestPart, schema: T): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const parsed = schema.safeParse(parsePart(req, part));
    if (!parsed.success) {
      next(parsed.error);
      return;
    }
    assignPart(req, part, parsed.data as z.infer<T>);
    next();
  };
}

function assignPart(req: Request, part: RequestPart, value: unknown): void {
  if (part === "body") {
    req.body = value;
    return;
  }
  if (part === "query") {
    req.query = value as Request["query"];
    return;
  }
  Object.assign(req.params, value as object);
}
