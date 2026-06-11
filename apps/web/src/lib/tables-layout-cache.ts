import type { QueryClient } from "@tanstack/react-query";

import { mapTablesLayoutPayload } from "@/lib/map-tables-layout";
import { queryKeys } from "@/lib/query-keys";
import { useDineInFloorsStore } from "@/stores/dine-in-floors-store";

/** Apply canonical `/tables/layout` payload to React Query + Zustand (DnD / quick-search). */
export function syncTablesLayoutQueryData(qc: QueryClient, layout: unknown): void {
  qc.setQueryData(queryKeys.tables.layout(), layout);
  useDineInFloorsStore.getState().hydrateFloors(mapTablesLayoutPayload(layout));
}

/** Normalize a table display number for exact comparison (trim, case-insensitive). */
export function normalizeTableNumberLabel(value: string): string {
  return value.trim().toLowerCase().replace(/^table\s*/i, "");
}

/**
 * Resolve a table UUID by exact `number` match across all floors in `/tables/layout` payload.
 * Does not use numeric coercion — "1" never matches "10", "14", or "21".
 */
export function findTableIdByNumberInLayout(layout: unknown, numberLabel: string): string | undefined {
  const target = normalizeTableNumberLabel(numberLabel);
  if (!target) return undefined;
  if (!Array.isArray(layout)) return undefined;
  for (const floor of layout) {
    if (!floor || typeof floor !== "object") continue;
    const tables = (floor as Record<string, unknown>).tables;
    if (!Array.isArray(tables)) continue;
    for (const t of tables) {
      if (!t || typeof t !== "object") continue;
      const tr = t as Record<string, unknown>;
      const num = normalizeTableNumberLabel(String(tr.number ?? ""));
      if (num === target) {
        const id = String(tr.id ?? "");
        return id || undefined;
      }
    }
  }
  return undefined;
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
