import { Prisma } from "@prisma/client";

import { ApiError } from "../http/ApiError.js";

export function mapPrismaClientError(err: Prisma.PrismaClientKnownRequestError): ApiError {
  switch (err.code) {
    case "P2002":
      return ApiError.conflict("Unique constraint violated", {
        code: err.code,
        meta: err.meta,
      });
    case "P2025":
      return ApiError.notFound("Record not found", { code: err.code, meta: err.meta });
    default:
      return ApiError.internal("Database error", { code: err.code, meta: err.meta });
  }
}

export function mapPrismaValidationError(_err: Prisma.PrismaClientValidationError): ApiError {
  return ApiError.badRequest("Invalid query or payload for database operation");
}
