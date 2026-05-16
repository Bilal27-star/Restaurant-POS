import type { QueryClient } from "@tanstack/react-query";

import { mapTablesLayoutPayload } from "@/lib/map-tables-layout";
import { queryKeys } from "@/lib/query-keys";
import { useDineInFloorsStore } from "@/stores/dine-in-floors-store";

/** Apply canonical `/tables/layout` payload to React Query + Zustand (DnD / quick-search). */
export function syncTablesLayoutQueryData(qc: QueryClient, layout: unknown): void {
  qc.setQueryData(queryKeys.tables.layout(), layout);
  useDineInFloorsStore.getState().hydrateFloors(mapTablesLayoutPayload(layout));
}

/** Resolve server table id after create — client-generated UUIDs are not what Postgres stored. */
export function findTableIdInLayout(layout: unknown, floorId: string, numberLabel: string): string | undefined {
  const target = numberLabel.trim();
  if (!floorId || !target) return undefined;
  if (!Array.isArray(layout)) return undefined;
  for (const floor of layout) {
    if (!floor || typeof floor !== "object") continue;
    const f = floor as Record<string, unknown>;
    if (String(f.id ?? "") !== floorId) continue;
    const tables = f.tables;
    if (!Array.isArray(tables)) continue;
    for (const t of tables) {
      if (!t || typeof t !== "object") continue;
      const tr = t as Record<string, unknown>;
      const num = String(tr.number ?? "").trim();
      if (num === target) {
        const id = String(tr.id ?? "");
        return id || undefined;
      }
    }
  }
  return undefined;
}
