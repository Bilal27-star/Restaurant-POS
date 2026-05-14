/**
 * Typed HTTP client for the POS API (`/api/v1`). No React — wire TanStack Query in the app.
 */
export { createPosApiClient, ApiClientError } from "./client.js";
export type { PosApiClient, PosApiClientOptions } from "./client.js";
export type { LoginRequest, LoginResponse, ApiSuccessEnvelope, ApiErrorEnvelope } from "./types.js";
