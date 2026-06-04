import { ApiClientError } from "@pos/api-client";

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}

export type OrderKitchenMeta = {
  kitchenDispatched: boolean;
  failedStations: string[];
  intentId: string | null;
};

export function extractOrderKitchenMeta(orderJson: unknown): OrderKitchenMeta | null {
  const kitchen = asRecord(asRecord(orderJson).kitchen);
  if (!("kitchenDispatched" in kitchen)) {
    return null;
  }
  const failed = kitchen.failedStations;
  return {
    kitchenDispatched: Boolean(kitchen.kitchenDispatched),
    failedStations: Array.isArray(failed) ? failed.filter((s): s is string => typeof s === "string") : [],
    intentId: typeof kitchen.intentId === "string" ? kitchen.intentId : null,
  };
}

/** Kitchen delta enabled and dispatch did not enqueue — caller must not treat send as successful. */
export function isKitchenSendIncomplete(orderJson: unknown): boolean {
  const meta = extractOrderKitchenMeta(orderJson);
  return meta != null && !meta.kitchenDispatched;
}

/** User-facing message from API error or order payload after kitchen dispatch. */
export function kitchenDispatchErrorMessage(err: unknown, orderJson?: unknown): string {
  if (orderJson != null && isKitchenSendIncomplete(orderJson)) {
    return kitchenSendFailureMessage(orderJson);
  }
  if (err && typeof err === "object" && "details" in err) {
    const details = (err as { details?: unknown }).details;
    if (details && typeof details === "object" && "kitchen" in (details as Record<string, unknown>)) {
      return kitchenSendFailureMessage({ kitchen: (details as Record<string, unknown>).kitchen });
    }
  }
  if (err instanceof ApiClientError) {
    return err.message.trim() || "Ticket cuisine non envoyé.";
  }
  if (err instanceof Error && err.message.trim()) {
    return err.message;
  }
  return "Ticket cuisine non envoyé. Vérifiez les imprimantes et le routage des stations.";
}

export function kitchenSendFailureMessage(orderJson: unknown): string {
  const meta = extractOrderKitchenMeta(orderJson);
  if (meta?.failedStations.length) {
    return `Ticket cuisine non envoyé (imprimante : ${meta.failedStations.join(", ")}). Vérifiez les imprimantes.`;
  }
  return "Ticket cuisine non envoyé. Vérifiez le routage des stations et les imprimantes.";
}
