import { create } from "zustand";

import type { FloorDef, RestaurantTable } from "@/components/tables/tables-demo-data";

function cloneFloors(floors: FloorDef[]): FloorDef[] {
  return structuredClone(floors);
}

type DineInFloorsState = {
  floors: FloorDef[];
  hydrateFloors: (floors: FloorDef[]) => void;
  resetFloors: (seed?: FloorDef[]) => void;
  moveTable: (payload: {
    fromFloorId: string;
    tableId: string;
    toFloorId: string;
    insertBeforeId?: string | null;
  }) => void;
};

export const useDineInFloorsStore = create<DineInFloorsState>((set) => ({
  floors: [],

  hydrateFloors: (floors) => {
    set({ floors: cloneFloors(floors) });
  },

  resetFloors: (seed) => {
    set({ floors: cloneFloors(seed ?? []) });
  },

  moveTable: ({ fromFloorId, tableId, toFloorId, insertBeforeId }) => {
    set((s) => {
      const prev = s.floors;
      let moving: RestaurantTable | undefined;
      const stripped = prev.map((f) => {
        if (f.id !== fromFloorId) return f;
        const t = f.tables.find((x) => x.id === tableId);
        if (!t) return f;
        moving = t;
        return { ...f, tables: f.tables.filter((x) => x.id !== tableId) };
      });
      if (!moving) return s;

      return {
        floors: stripped.map((f) => {
          if (f.id !== toFloorId) return f;
          const next = [...f.tables];
          let idx = insertBeforeId ? next.findIndex((t) => t.id === insertBeforeId) : -1;
          if (idx < 0) idx = next.length;
          next.splice(idx, 0, moving!);
          return { ...f, tables: next };
        }),
      };
    });
  },
}));
