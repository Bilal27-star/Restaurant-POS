import { fr } from "@/lib/locale/fr";

export const KITCHEN_STATION_IDS = ["PIZZA", "PLATS", "SNACK", "CAFETERIA", "NONE"] as const;

export type CategoryKitchenStationId = (typeof KITCHEN_STATION_IDS)[number];

export function normalizeKitchenStationId(value: unknown): CategoryKitchenStationId {
  if (value === "PIZZA" || value === "PLATS" || value === "SNACK" || value === "CAFETERIA") {
    return value;
  }
  return "NONE";
}

export function kitchenStationToApi(
  station: CategoryKitchenStationId | null | undefined,
): "PIZZA" | "PLATS" | "SNACK" | "CAFETERIA" | "NONE" | null | undefined {
  if (station === undefined) return undefined;
  if (station === null || station === "NONE") return null;
  return station;
}

export const KITCHEN_STATION_OPTIONS: { id: CategoryKitchenStationId; label: string }[] =
  KITCHEN_STATION_IDS.map((id) => ({
    id,
    label: fr.menuCategoryModal.kitchenStations[id],
  }));
