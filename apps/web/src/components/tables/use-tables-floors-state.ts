import { useShallow } from "zustand/react/shallow";

import { useDineInFloorsStore } from "@/stores/dine-in-floors-store";

/**
 * Tables + dine-in layout state (Zustand) hydrated from `/tables/layout`.
 * Mutations that hit the API should invalidate `queryKeys.tables.layout()` after success.
 */
export function useTablesFloorsState() {
  return useDineInFloorsStore(
    useShallow((s) => ({
      floors: s.floors,
      moveTable: s.moveTable,
      hydrateFloors: s.hydrateFloors,
    })),
  );
}
