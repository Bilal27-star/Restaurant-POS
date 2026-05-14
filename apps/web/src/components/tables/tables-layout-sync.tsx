import { useEffect } from "react";

import { useAuth } from "@/auth/auth-context";
import { mapTablesLayoutPayload } from "@/lib/map-tables-layout";
import { useTablesLayoutQuery } from "@/lib/use-tables-layout-query";
import { useDineInFloorsStore } from "@/stores/dine-in-floors-store";

/** Keeps dine-in floors store aligned with the canonical tables layout from the API. */
export function TablesLayoutSync() {
  const { accessToken } = useAuth();
  const hydrateFloors = useDineInFloorsStore((s) => s.hydrateFloors);
  const { data } = useTablesLayoutQuery(Boolean(accessToken));

  useEffect(() => {
    if (data !== undefined) {
      hydrateFloors(mapTablesLayoutPayload(data));
    }
  }, [data, hydrateFloors]);

  return null;
}
