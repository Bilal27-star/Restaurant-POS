import { useCallback, useMemo, useState } from "react";
import type { PosCartLineItem } from "./pos-cart-types";
import { formatDa } from "./pos-customization-pricing";

export function usePosCart() {
  const [lines, setLines] = useState<PosCartLineItem[]>([]);

  const addLine = useCallback((line: Omit<PosCartLineItem, "id">) => {
    const id =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `ln-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const lineTotalDa = line.unitPriceDa * line.quantity;
    setLines((prev) => [...prev, { ...line, id, lineTotalDa, notes: line.notes ?? "" }]);
  }, []);

  const setLineNotes = useCallback((lineId: string, notes: string) => {
    setLines((prev) => prev.map((l) => (l.id === lineId ? { ...l, notes } : l)));
  }, []);

  const incrementQty = useCallback((lineId: string) => {
    setLines((prev) =>
      prev.map((l) => {
        if (l.id !== lineId) return l;
        const quantity = l.quantity + 1;
        return { ...l, quantity, lineTotalDa: l.unitPriceDa * quantity };
      }),
    );
  }, []);

  const decrementQty = useCallback((lineId: string) => {
    setLines((prev) =>
      prev.map((l) => {
        if (l.id !== lineId) return l;
        const quantity = Math.max(1, l.quantity - 1);
        return { ...l, quantity, lineTotalDa: l.unitPriceDa * quantity };
      }),
    );
  }, []);

  const removeLine = useCallback((lineId: string) => {
    setLines((prev) => prev.filter((l) => l.id !== lineId));
  }, []);

  const clearCart = useCallback(() => {
    setLines([]);
  }, []);

  const { itemCount, totalDa, totalLabel } = useMemo(() => {
    const itemCount = lines.reduce((s, l) => s + l.quantity, 0);
    const totalDa = lines.reduce((s, l) => s + l.lineTotalDa, 0);
    return { itemCount, totalDa, totalLabel: formatDa(totalDa) };
  }, [lines]);

  return { lines, addLine, incrementQty, decrementQty, removeLine, setLineNotes, clearCart, itemCount, totalDa, totalLabel };
}
