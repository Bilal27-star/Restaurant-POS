import { useSearchParams } from "react-router-dom";

import { PosWorkspace } from "@/components/pos/pos-workspace";

/** Orders (POS) — tablet layout: real menu, cart, kitchen send (dine-in). */
export function OrdersPosPage() {
  const [searchParams] = useSearchParams();
  const initialTableId = searchParams.get("tableId");

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PosWorkspace className="min-h-0 flex-1" initialTableId={initialTableId} />
    </div>
  );
}
