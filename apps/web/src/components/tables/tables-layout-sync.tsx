import { useEffect } from "react";

import { mapTablesLayoutPayload } from "@/lib/map-tables-layout";
import { useTablesLayoutQuery } from "@/lib/use-tables-layout-query";
import { useDineInFloorsStore } from "@/stores/dine-in-floors-store";

/** Keeps dine-in floors store aligned with the canonical tables layout from the API. */
export function TablesLayoutSync() {
  const layoutQuery = useTablesLayoutQuery();
  const hydrateFloors = useDineInFloorsStore((s) => s.hydrateFloors);

  useEffect(() => {
    if (!layoutQuery.isSuccess || layoutQuery.data === undefined) return;
    const mapped = mapTablesLayoutPayload(layoutQuery.data);
    hydrateFloors(mapped);
  }, [layoutQuery.isSuccess, layoutQuery.data, hydrateFloors]);

  return null;
}
