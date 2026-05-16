import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { io, type Socket } from "socket.io-client";

import { useAuth } from "@/auth/auth-context";
import { logDataFlow } from "@/lib/desktop/data-flow-log";
import { getAccessToken, resolvedApiOrigin } from "@/lib/app-api";
import { queryKeys } from "@/lib/query-keys";

function socketBaseUrl(): string {
  const o = resolvedApiOrigin();
  if (o.length > 0) return o;
  if (typeof window !== "undefined") return window.location.origin;
  return "";
}

type BurstFlags = {
  orders: boolean;
  tables: boolean;
  analytics: boolean;
  shifts: boolean;
  menu: boolean;
  settings: boolean;
};

const emptyBurst = (): BurstFlags => ({
  orders: false,
  tables: false,
  analytics: false,
  shifts: false,
  menu: false,
  settings: false,
});

/**
 * Subscribes to Socket.IO staff channels and invalidates TanStack Query caches on domain events.
 * Coalesces invalidations during bursts (rush hour) to avoid render/query storms.
 */
export function usePosRealtime() {
  const qc = useQueryClient();
  const { accessToken, ready } = useAuth();
  const socketRef = useRef<Socket | null>(null);
  const burstTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const burstFlagsRef = useRef<BurstFlags>(emptyBurst());

  useEffect(() => {
    if (!ready || !accessToken) {
      if (burstTimerRef.current) {
        clearTimeout(burstTimerRef.current);
        burstTimerRef.current = null;
      }
      burstFlagsRef.current = emptyBurst();
      const s = socketRef.current;
      if (s) {
        s.removeAllListeners();
        s.disconnect();
      }
      socketRef.current = null;
      return;
    }

    const scheduleBurstFlush = () => {
      if (burstTimerRef.current) {
        clearTimeout(burstTimerRef.current);
      }
      burstTimerRef.current = setTimeout(() => {
        burstTimerRef.current = null;
        const f = burstFlagsRef.current;
        burstFlagsRef.current = emptyBurst();
        if (f.orders) void qc.invalidateQueries({ queryKey: ["orders"] });
        if (f.tables || f.orders) void qc.invalidateQueries({ queryKey: queryKeys.tables.layout() });
        if (f.analytics) void qc.invalidateQueries({ queryKey: ["analytics"] });
        if (f.shifts) void qc.invalidateQueries({ queryKey: queryKeys.shifts.current() });
        if (f.menu) void qc.invalidateQueries({ queryKey: queryKeys.menu.catalog() });
        if (f.settings) void qc.invalidateQueries({ queryKey: queryKeys.settings.system() });
      }, 120);
    };

    const bumpOrdersAndTables = () => {
      burstFlagsRef.current.orders = true;
      burstFlagsRef.current.tables = true;
      scheduleBurstFlush();
    };

    const onTableUpdated = () => {
      burstFlagsRef.current.tables = true;
      burstFlagsRef.current.analytics = true;
      scheduleBurstFlush();
    };

    const onAnalyticsTick = () => {
      burstFlagsRef.current.analytics = true;
      scheduleBurstFlush();
    };

    const onShiftUpdated = () => {
      burstFlagsRef.current.shifts = true;
      scheduleBurstFlush();
    };

    const url = socketBaseUrl();
    const socket = io(url, {
      path: "/socket.io",
      transports: ["websocket", "polling"],
      auth: { token: getAccessToken() },
      reconnectionDelay: 800,
      reconnectionDelayMax: 15_000,
      randomizationFactor: 0.45,
    });
    socketRef.current = socket;

    socket.on("order:created", bumpOrdersAndTables);
    socket.on("order:updated", bumpOrdersAndTables);
    socket.on("order:completed", bumpOrdersAndTables);
    socket.on("order:cancelled", bumpOrdersAndTables);
    socket.on("payment:captured", bumpOrdersAndTables);
    socket.on("payment:refunded", bumpOrdersAndTables);
    socket.on("table:updated", onTableUpdated);
    socket.on("analytics:tick", onAnalyticsTick);
    socket.on("shift:updated", onShiftUpdated);

    socket.on("connect", () => {
      logDataFlow("socket_connect", { url });
      burstFlagsRef.current.orders = true;
      burstFlagsRef.current.tables = true;
      burstFlagsRef.current.shifts = true;
      burstFlagsRef.current.analytics = true;
      burstFlagsRef.current.menu = true;
      burstFlagsRef.current.settings = true;
      scheduleBurstFlush();
    });

    socket.on("admin:broadcast", (msg: unknown) => {
      if (!msg || typeof msg !== "object") return;
      const m = msg as { kind?: string; domains?: string[] };
      if (m.kind !== "data:changed" || !Array.isArray(m.domains)) return;
      for (const d of m.domains) {
        if (d === "tables") burstFlagsRef.current.tables = true;
        if (d === "menu") burstFlagsRef.current.menu = true;
        if (d === "settings") burstFlagsRef.current.settings = true;
        if (d === "shifts") burstFlagsRef.current.shifts = true;
      }
      scheduleBurstFlush();
    });

    socket.on("connect_error", (err: Error) => {
      logDataFlow("socket_connect_error", { url, message: err.message });
    });

    return () => {
      if (burstTimerRef.current) {
        clearTimeout(burstTimerRef.current);
        burstTimerRef.current = null;
      }
      burstFlagsRef.current = emptyBurst();
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
    };
  }, [accessToken, qc, ready]);
}
