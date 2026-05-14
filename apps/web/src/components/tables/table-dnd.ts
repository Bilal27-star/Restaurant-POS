/** HTML5 drag payload for moving tables between floors / reordering. */

export const TABLE_DRAG_MIME = "application/x-pos-table";

export type TableDragPayload = {
  tableId: string;
  fromFloorId: string;
};

export function encodeTableDragPayload(p: TableDragPayload): string {
  return JSON.stringify(p);
}

export function parseTableDragPayload(dataTransfer: DataTransfer): TableDragPayload | null {
  const raw = dataTransfer.getData(TABLE_DRAG_MIME) || dataTransfer.getData("text/plain");
  if (!raw) return null;
  try {
    const o = JSON.parse(raw) as unknown;
    if (!o || typeof o !== "object") return null;
    const tableId = (o as { tableId?: unknown }).tableId;
    const fromFloorId = (o as { fromFloorId?: unknown }).fromFloorId;
    if (typeof tableId !== "string" || typeof fromFloorId !== "string") return null;
    return { tableId, fromFloorId };
  } catch {
    return null;
  }
}
