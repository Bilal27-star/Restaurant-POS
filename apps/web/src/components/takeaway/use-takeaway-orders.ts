import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useTakeawayOrdersQuery } from "@/hooks/use-takeaway-orders-query";
import { fr } from "@/lib/locale/fr";
import { buildOrderPatchBody } from "@/components/pos/pos-order-cart-adapter";
import { getAppApi } from "@/lib/app-api";
import { queryKeys } from "@/lib/query-keys";
import type { SerializedTakeawayOrder } from "@/types/serialized-order";
import type { TakeawayStatusFilter } from "./takeaway-order-types";
import { takeawayFilterMatches } from "./takeaway-order-types";

function startOfLocalDayMs(ts: number) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function useLiveNow(intervalMs = 1000) {
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return nowMs;
}

export function minutesBetween(fromMs: number, toMs: number) {
  return Math.floor(Math.max(0, toMs - fromMs) / 60_000);
}

export function formatElapsedShort(createdAtMs: number, nowMs: number) {
  const m = minutesBetween(createdAtMs, nowMs);
  if (m < 1) return fr.common.lessThanOneMin;
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h}h ${r}m` : `${h}h`;
}

/** Positive = minutes remaining; negative = late by that many minutes */
export function minutesUntil(estimatedReadyAtMs: number, nowMs: number) {
  return Math.round((estimatedReadyAtMs - nowMs) / 60_000);
}

function openedAtMs(o: SerializedTakeawayOrder): number {
  return new Date(o.openedAt).getTime();
}

function closedAtMs(o: SerializedTakeawayOrder): number {
  return o.closedAt ? new Date(o.closedAt).getTime() : 0;
}

export function useTakeawayOrders(nowMs: number) {
  const ordersQuery = useTakeawayOrdersQuery();
  const orders = ordersQuery.data ?? [];
  const qc = useQueryClient();

  const refreshTakeawayQueries = () => {
    void qc.invalidateQueries({ queryKey: queryKeys.orders.takeawayBoard() });
    void qc.invalidateQueries({ queryKey: queryKeys.orders.takeawayHistory() });
    void qc.invalidateQueries({ queryKey: queryKeys.navigation.counts() });
  };

  const startPreparing = async (id: string) => {
    try {
      await getAppApi().orders.patch(id, buildOrderPatchBody({ status: "PREPARING" }));
      refreshTakeawayQueries();
    } catch (err) {
      console.error("takeaway startPreparing failed", err);
      throw err;
    }
  };
  const markReady = async (id: string) => {
    try {
      await getAppApi().orders.patch(id, buildOrderPatchBody({ status: "READY" }));
      refreshTakeawayQueries();
    } catch (err) {
      console.error("takeaway markReady failed", err);
      throw err;
    }
  };
  const cancelOrder = async (id: string) => {
    const target = orders.find((o) => o.id === id);
    try {
      const body = target?.version != null ? { version: target.version } : {};
      await getAppApi().orders.cancel(id, body);
      refreshTakeawayQueries();
    } catch (err) {
      console.error("takeaway cancelOrder failed", err);
      throw err;
    }
  };

  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<TakeawayStatusFilter>("all");

  const visibleOrders = useMemo(() => {
    const q = query.trim().toLowerCase();
    return orders.filter((o) => {
      if (o.status === "CANCELLED") return false;
      if (!takeawayFilterMatches(statusFilter, o.status)) return false;
      if (!q) return true;
      const blob = [
        String(o.orderNumber || ""),
        o.ticketPublicCode || "",
        o.customer?.name || "",
        o.customer?.phone || "",
        o.customer?.address || "",
        o.customerNotes || "",
        o.kitchenNotes || "",
        ...o.items.map((i) => i.nameSnapshot),
      ]
        .join(" ")
        .toLowerCase();
      return blob.includes(q);
    });
  }, [orders, query, statusFilter]);

  const dayStart = useMemo(() => startOfLocalDayMs(nowMs), [nowMs]);

  const columnNew = useMemo(
    () => visibleOrders.filter((o) => o.status === "PENDING").sort((a, b) => openedAtMs(a) - openedAtMs(b)),
    [visibleOrders],
  );
  const columnPreparing = useMemo(
    () => visibleOrders.filter((o) => o.status === "PREPARING").sort((a, b) => openedAtMs(a) - openedAtMs(b)),
    [visibleOrders],
  );
  const columnReady = useMemo(
    () => visibleOrders.filter((o) => o.status === "READY").sort((a, b) => openedAtMs(a) - openedAtMs(b)),
    [visibleOrders],
  );
  const columnDelivered = useMemo(
    () =>
      visibleOrders
        .filter((o) => {
          if (o.status !== "COMPLETED") return false;
          return closedAtMs(o) >= dayStart;
        })
        .sort((a, b) => closedAtMs(b) - closedAtMs(a)),
    [visibleOrders, dayStart],
  );

  const kpis = useMemo(() => {
    const active = orders.filter((o) => o.status !== "CANCELLED");
    const pending = active.filter((o) => o.status === "PENDING" || o.status === "PREPARING").length;
    const ready = active.filter((o) => o.status === "READY").length;
    const totalToday = orders.filter((o) => openedAtMs(o) >= dayStart && o.status !== "CANCELLED").length;
    return { pending, ready, totalToday };
  }, [orders, dayStart]);

  return {
    orders,
    ordersQuery,
    query,
    setQuery,
    statusFilter,
    setStatusFilter,
    columnNew,
    columnPreparing,
    columnReady,
    columnDelivered,
    startPreparing,
    markReady,
    cancelOrder,
    refreshTakeawayQueries,
    kpis,
  };
}
