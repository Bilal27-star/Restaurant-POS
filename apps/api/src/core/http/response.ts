import type { Response } from "express";

export type SuccessEnvelope<T> = {
  success: true;
  data: T;
  message?: string;
};

export type ErrorEnvelope = {
  success: false;
  error: string;
  details?: unknown;
};

export function sendSuccess<T>(
  res: Response,
  data: T,
  options?: { message?: string; status?: number },
): void {
  const body: SuccessEnvelope<T> = { success: true, data };
  if (options?.message !== undefined) {
    body.message = options.message;
  }
  res.status(options?.status ?? 200).json(body);
}

export function sendError(
  res: Response,
  status: number,
  error: string,
  details?: unknown,
): void {
  const body: ErrorEnvelope = { success: false, error };
  if (details !== undefined) {
    body.details = details;
  }
  res.status(status).json(body);
}
