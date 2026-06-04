import { useSearchParams } from "react-router-dom";

import { PageShell } from "@/components/data/page-shell";
import { PosWorkspace } from "@/components/pos/pos-workspace";
import { usePageRouteDiagnostics } from "@/hooks/use-page-route-diagnostics";

/** Orders (POS) — tablet layout: real menu, cart, kitchen send (dine-in). */
export function OrdersPosPage() {
  const [searchParams] = useSearchParams();
  const initialTableId = searchParams.get("tableId");
  const initialEditOrderId = searchParams.get("editOrderId");
  usePageRouteDiagnostics("orders-pos");

  return (
    <PageShell fill>
      <PosWorkspace
        className="min-h-0 flex-1"
        initialTableId={initialTableId}
        initialEditOrderId={initialEditOrderId}
      />
    </PageShell>
  );
}
