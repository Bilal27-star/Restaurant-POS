import type { PosApiClient } from "@pos/api-client";
import { ApiClientError } from "@pos/api-client";
import type { CloudSyncTransport } from "@pos/offline-engine";
import type { OutboxOperation, PushBatchResult, PushOpOutcome } from "@pos/offline-engine";

import {
  buildOrderCreateBody,
  buildOrderPatchBody,
  sanitizeAddOrderLinesPayload,
  sanitizeOrderCreatePayload,
  sanitizeOrderLinePatchPayload,
  sanitizeOrderPatchPayload,
  sanitizeOrderVersionPayload,
} from "@/components/pos/pos-order-cart-adapter";

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function mapApiErrorToOutcome(op: OutboxOperation, err: unknown): { outcome: PushOpOutcome; message: string } {
  if (!(err instanceof ApiClientError)) {
    return { outcome: "retry", message: err instanceof Error ? err.message : String(err) };
  }
  const st = err.status;
  const msg = err.message || "request_failed";
  if (st === 404) {
    if (
      op.kind === "order.patch" ||
      op.kind === "order.line.add" ||
      op.kind === "order.line.update" ||
      op.kind === "order.line.delete" ||
      op.kind === "order.complete" ||
      op.kind === "order.cancel"
    ) {
      return { outcome: "dropped", message: msg };
    }
    return { outcome: "dead", message: msg };
  }
  if (st === 409) {
    return { outcome: "retry", message: msg };
  }
  if (st === 401 || st === 403) {
    return { outcome: "retry", message: msg };
  }
  if (st >= 500) {
    return { outcome: "retry", message: msg };
  }
  if (st === 422 || st === 400) {
    return { outcome: "dead", message: msg };
  }
  return { outcome: "retry", message: msg };
}

/**
 * Maps durable outbox rows to REST `/api/v1` calls. Payments use server idempotency keys;
 * order creates use `clientMutationId` → `offlineClientMutationId` on the server.
 */
export function createPosRestCloudTransport(getApi: () => PosApiClient): CloudSyncTransport {
  return {
    isEnabled: true,
    async pushBatch(ops: OutboxOperation[]): Promise<PushBatchResult> {
      const conflicts: PushBatchResult["conflicts"] = [];
      const perOp: PushBatchResult["perOp"] = [];
      const api = getApi();

      for (const op of ops) {
        try {
          const r = await executeOne(api, op);
          perOp.push({ operationId: op.id, outcome: r.outcome, errorMessage: r.message });
        } catch (err) {
          const m = mapApiErrorToOutcome(op, err);
          perOp.push({ operationId: op.id, outcome: m.outcome, errorMessage: m.message });
        }
      }
      return { perOp, conflicts };
    },
  };
}

async function executeOne(
  api: PosApiClient,
  op: OutboxOperation,
): Promise<{ outcome: PushOpOutcome; message?: string }> {
  const payload = op.payload;

  switch (op.kind) {
    case "order.create": {
      const raw = isRecord(payload) ? payload : {};
      const body = buildOrderCreateBody(
        sanitizeOrderCreatePayload({
          ...raw,
          clientMutationId: op.clientMutationId,
        }),
      );
      await api.orders.create(body);
      return { outcome: "accepted" };
    }
    case "order.patch": {
      if (!isRecord(payload) || typeof payload.orderId !== "string") {
        return { outcome: "dead", message: "invalid_payload:order.patch" };
      }
      const { orderId, ...rest } = payload as { orderId: string; [k: string]: unknown };
      await api.orders.patch(orderId, buildOrderPatchBody(sanitizeOrderPatchPayload(rest)));
      return { outcome: "accepted" };
    }
    case "order.line.add": {
      if (!isRecord(payload) || typeof payload.orderId !== "string") {
        return { outcome: "dead", message: "invalid_payload:order.line.add" };
      }
      const { orderId, ...body } = payload as { orderId: string; [k: string]: unknown };
      await api.orders.addLines(orderId, sanitizeAddOrderLinesPayload(body));
      return { outcome: "accepted" };
    }
    case "order.line.update": {
      if (!isRecord(payload) || typeof payload.orderId !== "string" || typeof payload.lineId !== "string") {
        return { outcome: "dead", message: "invalid_payload:order.line.update" };
      }
      const { orderId, lineId, ...body } = payload as { orderId: string; lineId: string; [k: string]: unknown };
      await api.orders.patchLine(orderId, lineId, sanitizeOrderLinePatchPayload(body));
      return { outcome: "accepted" };
    }
    case "order.line.delete": {
      if (!isRecord(payload) || typeof payload.orderId !== "string" || typeof payload.lineId !== "string") {
        return { outcome: "dead", message: "invalid_payload:order.line.delete" };
      }
      const { orderId, lineId, query } = payload as {
        orderId: string;
        lineId: string;
        query?: Record<string, string>;
      };
      await api.orders.deleteLine(orderId, lineId, query);
      return { outcome: "accepted" };
    }
    case "order.complete": {
      if (!isRecord(payload) || typeof payload.orderId !== "string") {
        return { outcome: "dead", message: "invalid_payload:order.complete" };
      }
      const { orderId, ...body } = payload as { orderId: string; [k: string]: unknown };
      await api.orders.complete(orderId, sanitizeOrderVersionPayload(body));
      return { outcome: "accepted" };
    }
    case "order.cancel": {
      if (!isRecord(payload) || typeof payload.orderId !== "string") {
        return { outcome: "dead", message: "invalid_payload:order.cancel" };
      }
      const { orderId, ...body } = payload as { orderId: string; [k: string]: unknown };
      await api.orders.cancel(orderId, sanitizeOrderVersionPayload(body));
      return { outcome: "accepted" };
    }
    case "payment.capture": {
      if (!isRecord(payload) || typeof payload.orderId !== "string") {
        return { outcome: "dead", message: "invalid_payload:payment.capture" };
      }
      const idem = op.idempotencyKey ?? op.clientMutationId;
      await api.payments.capture({
        ...(payload as Record<string, unknown>),
        idempotencyKey: idem,
      });
      return { outcome: "accepted" };
    }
    case "payment.refund": {
      if (!isRecord(payload) || typeof payload.paymentId !== "string") {
        return { outcome: "dead", message: "invalid_payload:payment.refund" };
      }
      const { paymentId, ...body } = payload as { paymentId: string; [k: string]: unknown };
      await api.payments.refund(paymentId, body);
      return { outcome: "accepted" };
    }
    case "shift.open": {
      await api.shifts.open(payload as { openingCashFloat: string });
      return { outcome: "accepted" };
    }
    case "shift.close": {
      if (!isRecord(payload) || typeof payload.shiftId !== "string") {
        return { outcome: "dead", message: "invalid_payload:shift.close" };
      }
      const { shiftId, ...body } = payload as { shiftId: string; [k: string]: unknown };
      await api.shifts.close(shiftId, body as { closingCashCount: string; notes?: string | null });
      return { outcome: "accepted" };
    }
    case "expense.record": {
      await api.expenses.create(payload as Record<string, unknown>);
      return { outcome: "accepted" };
    }
    case "table.update": {
      if (!isRecord(payload) || typeof payload.tableId !== "string") {
        return { outcome: "dead", message: "invalid_payload:table.update" };
      }
      const { tableId, ...body } = payload as { tableId: string; [k: string]: unknown };
      await api.tables.patchTable(tableId, body);
      return { outcome: "accepted" };
    }
    case "print.job":
      return { outcome: "dropped", message: "print_job_local_only" };
    default: {
      const k: never = op.kind;
      return { outcome: "dead", message: `unknown_kind:${String(k)}` };
    }
  }
}
