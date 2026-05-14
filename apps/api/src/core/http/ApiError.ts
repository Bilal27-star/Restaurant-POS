export type ApiErrorCode =
  | "BAD_REQUEST"
  | "VALIDATION_ERROR"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "NOT_IMPLEMENTED"
  | "INTERNAL_ERROR";

/**
 * Operational errors the API intentionally returns to clients.
 * Unknown errors should still be mapped to a safe response by the global handler.
 */
export class ApiError extends Error {
  public readonly isOperational = true;

  constructor(
    public readonly statusCode: number,
    public readonly code: ApiErrorCode,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
    Object.setPrototypeOf(this, new.target.prototype);
  }

  static badRequest(message: string, details?: unknown) {
    return new ApiError(400, "BAD_REQUEST", message, details);
  }

  static unauthorized(message = "Unauthorized", details?: unknown) {
    return new ApiError(401, "UNAUTHORIZED", message, details);
  }

  static forbidden(message = "Forbidden", details?: unknown) {
    return new ApiError(403, "FORBIDDEN", message, details);
  }

  static notFound(message = "Not found", details?: unknown) {
    return new ApiError(404, "NOT_FOUND", message, details);
  }

  static conflict(message: string, details?: unknown) {
    return new ApiError(409, "CONFLICT", message, details);
  }

  static rateLimited(message = "Too many requests", details?: unknown) {
    return new ApiError(429, "RATE_LIMITED", message, details);
  }

  static notImplemented(message: string, details?: unknown) {
    return new ApiError(501, "NOT_IMPLEMENTED", message, details);
  }

  static internal(message = "Internal server error", details?: unknown) {
    return new ApiError(500, "INTERNAL_ERROR", message, details);
  }
}
