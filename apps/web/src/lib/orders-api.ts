import type { PosApiClient } from "@pos/api-client";
import { ApiClientError } from "@pos/api-client";

import {
  buildAddOrderLinesBody,
  buildOrderCreateBody,
  buildOrderPatchBody,
  sanitizeAddOrderLinesPayload,
  sanitizeOrderCreatePayload,
  sanitizeOrderLinePatchPayload,
  sanitizeOrderPatchPayload,
  sanitizeOrderVersionPayload,
  type OrderCreateBody,
} from "@/components/pos/pos-order-cart-adapter";

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}

/** In-flight dedupe for identical order creates (e.g. double-click before table layout resolves). */
const inflightOrderCreates = new Map<string, Promise<unknown>>();

function createDedupeKey(body: OrderCreateBody): string {
  if (body.clientMutationId) return `cm:${body.clientMutationId}`;
  return `body:${JSON.stringify(body)}`;
}

export function sanitizeOrderCreateForApi(body: unknown): OrderCreateBody {
  return buildOrderCreateBody(sanitizeOrderCreatePayload(asRecord(body)));
}

export function isOrderPrintRoutingValidationError(err: unknown): boolean {
  if (!(err instanceof ApiClientError) || err.status !== 400) return false;
  const issues = (err.details as { issues?: { message?: string; code?: string }[] } | undefined)?.issues;
  if (!Array.isArray(issues)) {
    return /station/i.test(err.message) && /waiterName/i.test(err.message);
  }
  return issues.some(
    (issue) =>
      issue.code === "unrecognized_keys" &&
      typeof issue.message === "string" &&
      /station/i.test(issue.message) &&
      /waiterName/i.test(issue.message),
  );
}

/**
 * Wraps REST order mutations so kitchen-ticket routing field (`station`) never leaves the browser.
 * Also dedupes concurrent POST /orders with the same payload key.
 */
export function wrapOrdersApi(orders: PosApiClient["orders"]): PosApiClient["orders"] {
  return {
    ...orders,
    create: (body: unknown) => {
      const clean = sanitizeOrderCreateForApi(body);
      const dedupeKey = createDedupeKey(clean);
      const inflight = inflightOrderCreates.get(dedupeKey);
      if (inflight) return inflight;

      const promise = orders.create(clean).finally(() => {
        if (inflightOrderCreates.get(dedupeKey) === promise) {
          inflightOrderCreates.delete(dedupeKey);
        }
      });
      inflightOrderCreates.set(dedupeKey, promise);
      return promise;
    },
    patch: (orderId: string, body: unknown) =>
      orders.patch(orderId, buildOrderPatchBody(sanitizeOrderPatchPayload(asRecord(body)))),
    addLines: (orderId: string, body: unknown) =>
      orders.addLines(orderId, buildAddOrderLinesBody(sanitizeAddOrderLinesPayload(asRecord(body)))),
    patchLine: (orderId: string, lineId: string, body: unknown) =>
      orders.patchLine(orderId, lineId, sanitizeOrderLinePatchPayload(asRecord(body))),
    complete: (orderId: string, body: unknown) =>
      orders.complete(orderId, sanitizeOrderVersionPayload(asRecord(body))),
    cancel: (orderId: string, body: unknown) =>
      orders.cancel(orderId, sanitizeOrderVersionPayload(asRecord(body))),
  };
}

export function applySanitizedOrdersApi(client: PosApiClient): PosApiClient {
  return { ...client, orders: wrapOrdersApi(client.orders) };
}
