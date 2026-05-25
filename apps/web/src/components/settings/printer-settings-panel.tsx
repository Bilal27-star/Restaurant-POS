import { HardDrive, Pencil, Plus, Radar, Printer, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/menu/confirm-dialog";
import { PrinterFormModal } from "@/components/settings/printer-form-modal";
import { usePrinterMutations, usePrintersQuery } from "@/hooks/use-printer-queries";
import { fr } from "@/lib/locale/fr";
import { isTauriDesktop } from "@/lib/desktop/tauri-host";
import {
  type ApiPrinter,
  type DiscoveredPrinter,
  type KitchenStation,
  formatPrinterConnection,
  kitchenStationLabel,
  parseConnectionHostPort,
  printerRoleLabelFr,
} from "@/lib/printing/printer-form-utils";
import { cn } from "@/lib/utils";
import { PrinterManager } from "@/services/printing";

type Props = {
  canThermalPrint: boolean;
  thermalWorkerRunning: boolean;
  onToast: (message: string) => void;
};

export function PrinterSettingsPanel({ canThermalPrint, thermalWorkerRunning, onToast }: Props) {
  const printersQuery = usePrintersQuery(canThermalPrint);
  const { createPrinter, updatePrinter, deletePrinter, discoverNetwork, testConnection } =
    usePrinterMutations();

  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<"add" | "edit">("add");
  const [editingPrinter, setEditingPrinter] = useState<ApiPrinter | null>(null);
  const [discoveredSeed, setDiscoveredSeed] = useState<{ host: string; port: number; station?: KitchenStation } | null>(
    null,
  );
  const [discoveredList, setDiscoveredList] = useState<DiscoveredPrinter[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<ApiPrinter | null>(null);
  const [testBusyPrinterId, setTestBusyPrinterId] = useState<string | null>(null);
  const [networkTestBusyId, setNetworkTestBusyId] = useState<string | null>(null);

  const openAdd = () => {
    setFormMode("add");
    setEditingPrinter(null);
    setDiscoveredSeed(null);
    setFormOpen(true);
  };

  const openEdit = (p: ApiPrinter) => {
    setFormMode("edit");
    setEditingPrinter(p);
    setDiscoveredSeed(null);
    setFormOpen(true);
  };

  const openAddFromDiscovered = (d: DiscoveredPrinter, station?: KitchenStation) => {
    setFormMode("add");
    setEditingPrinter(null);
    setDiscoveredSeed({ host: d.host, port: d.port, station });
    setFormOpen(true);
  };

  const runDiscover = async () => {
    try {
      const found = await discoverNetwork.mutateAsync();
      setDiscoveredList(found);
      onToast(
        found.length
          ? fr.settingsPage.printerDiscoverFound.replace("{n}", String(found.length))
          : fr.settingsPage.printerDiscoverEmpty,
      );
    } catch (e: unknown) {
      onToast(e instanceof Error ? e.message : fr.settingsPage.printerDiscoverErr);
    }
  };

  const runNetworkTest = async (p: ApiPrinter) => {
    const { host, port } = parseConnectionHostPort(p.connectionJson);
    if (!host) {
      onToast(fr.settingsPage.printerTestNoHost);
      return;
    }
    setNetworkTestBusyId(p.id);
    try {
      const res = await testConnection.mutateAsync({ host, port });
      if (res.success) {
        onToast(fr.settingsPage.printerTestConnectionOk.replace("{ms}", String(res.latency)));
      } else {
        onToast(res.error || fr.settingsPage.printerTestErr);
      }
    } catch {
      onToast(fr.settingsPage.printerTestErr);
    } finally {
      setNetworkTestBusyId(null);
    }
  };

  const runThermalTest = async (p: ApiPrinter) => {
    setTestBusyPrinterId(p.id);
    try {
      if (p.role === "KITCHEN") {
        await PrinterManager.testKitchen(p.id);
      } else {
        await PrinterManager.testReceipt(p.id);
      }
      onToast(fr.settingsPage.printerTestOk);
    } catch {
      onToast(fr.settingsPage.printerTestErr);
    } finally {
      setTestBusyPrinterId(null);
    }
  };

  const handleFormTest = async (host: string, port: number) => {
    const res = await testConnection.mutateAsync({ host, port });
    if (res.success) {
      return {
        ok: true,
        message: fr.settingsPage.printerTestConnectionOk.replace("{ms}", String(res.latency)),
      };
    }
    return { ok: false, message: res.error || fr.settingsPage.printerTestErr };
  };

  const handleSave = async (body: Record<string, unknown>) => {
    try {
      if (formMode === "edit" && editingPrinter) {
        await updatePrinter.mutateAsync({ printerId: editingPrinter.id, body });
        onToast(fr.settingsPage.printerSaved);
      } else {
        await createPrinter.mutateAsync(body);
        onToast(fr.settingsPage.printerCreated);
      }
    } catch (e: unknown) {
      onToast(e instanceof Error ? e.message : fr.settingsPage.printerSaveErr);
      throw e;
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deletePrinter.mutateAsync(deleteTarget.id);
      onToast(fr.settingsPage.printerDeleted);
      setDeleteTarget(null);
    } catch (e: unknown) {
      onToast(e instanceof Error ? e.message : fr.settingsPage.printerSaveErr);
    }
  };

  if (!canThermalPrint) {
    return <p className="text-sm font-medium leading-relaxed text-amber-200/90">{fr.settingsPage.printerNoPermission}</p>;
  }

  return (
    <>
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex size-11 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500/20 to-teal-500/10 ring-1 ring-emerald-500/25">
            <Printer className="size-5 text-emerald-200" aria-hidden />
          </div>
          <div>
            <p className="text-xs font-medium text-slate-400">{fr.settingsPage.printerHint}</p>
          </div>
        </div>
        {isTauriDesktop() ? (
          <div className="max-w-md rounded-xl border border-pos-border-subtle/80 bg-pos-depth/50 px-3 py-2.5 text-xs font-medium leading-snug text-slate-300">
            <p className="font-semibold text-slate-200">{fr.settingsPage.printerThermalQueue}</p>
            <p className={cn("mt-1", thermalWorkerRunning ? "text-emerald-300" : "text-amber-200/90")}>
              {thermalWorkerRunning ? fr.settingsPage.printerQueueRunning : fr.settingsPage.printerQueueStopped}
            </p>
          </div>
        ) : null}
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={discoverNetwork.isPending}
          className="h-9 gap-1.5 rounded-lg border-pos-border-subtle bg-pos-glass/80 text-xs font-semibold"
          onClick={() => void runDiscover()}
        >
          <Radar className="size-3.5" aria-hidden />
          {discoverNetwork.isPending ? fr.settingsPage.printerSearching : fr.settingsPage.printerSearchNetwork}
        </Button>
        <Button
          type="button"
          size="sm"
          className="h-9 gap-1.5 rounded-lg text-xs font-semibold"
          onClick={openAdd}
        >
          <Plus className="size-3.5" aria-hidden />
          {fr.settingsPage.printerAdd}
        </Button>
      </div>

      {discoveredList.length > 0 ? (
        <div className="mb-4 rounded-xl border border-sky-500/20 bg-sky-500/[0.06] p-4">
          <p className="mb-3 text-xs font-bold uppercase tracking-wide text-sky-200/90">
            {fr.settingsPage.printerDiscoveredTitle}
          </p>
          <ul className="space-y-2">
            {discoveredList.map((d) => (
              <li
                key={`${d.host}:${d.port}`}
                className="flex flex-col gap-2 rounded-lg border border-white/[0.06] bg-pos-depth/40 px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
              >
                <span className="font-mono text-sm text-slate-200">
                  {d.host}:{d.port}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs font-semibold"
                  onClick={() => openAddFromDiscovered(d)}
                >
                  {fr.settingsPage.printerAddFromScan}
                </Button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {printersQuery.isLoading ? (
        <p className="text-sm text-slate-400">…</p>
      ) : printersQuery.isError ? (
        <p className="text-sm font-medium text-rose-300">{fr.settingsPage.printerLoadError}</p>
      ) : (printersQuery.data?.length ?? 0) === 0 ? (
        <p className="text-sm font-medium leading-relaxed text-slate-400">{fr.settingsPage.printerEmpty}</p>
      ) : (
        <ul className="space-y-3">
          {printersQuery.data!.map((p) => {
            const isKitchen = p.role === "KITCHEN";
            const isReceiptStation = p.role === "RECEIPT" || p.role === "CASHIER";
            const thermalBusy = testBusyPrinterId === p.id;
            const netBusy = networkTestBusyId === p.id;
            const defaultBusy = updatePrinter.isPending;
            return (
              <li
                key={p.id}
                className="flex flex-col gap-3 rounded-xl border border-pos-border-subtle/80 bg-pos-depth/40 px-4 py-3.5"
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex min-w-0 items-start gap-3">
                    <HardDrive className="mt-0.5 size-4 shrink-0 text-slate-500" aria-hidden />
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold text-white">{p.name}</p>
                        <span className="rounded-md border border-white/10 bg-white/[0.06] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-300">
                          {printerRoleLabelFr(p.role)}
                        </span>
                        {isKitchen && p.kitchenStation ? (
                          <span className="rounded-md border border-violet-500/30 bg-violet-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-violet-200">
                            {kitchenStationLabel(p.kitchenStation)}
                          </span>
                        ) : null}
                        {p.isDefault ? (
                          <span className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-200">
                            {fr.settingsPage.printerDefaultBadge}
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-1 font-mono text-xs tabular-nums text-slate-400">
                        {formatPrinterConnection(p.connectionJson)}
                      </p>
                      <p className="mt-0.5 text-[11px] text-slate-500">
                        {p.driver} · {p.paperWidthChars} cols
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 sm:justify-end">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={netBusy}
                      className="h-9 rounded-lg border-pos-border-subtle bg-pos-glass/80 text-xs font-semibold"
                      onClick={() => void runNetworkTest(p)}
                    >
                      {netBusy ? fr.settingsPage.printerTesting : fr.settingsPage.printerTestConnection}
                    </Button>
                    {isTauriDesktop() && (isKitchen || isReceiptStation) ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={!p.isActive || thermalBusy}
                        className="h-9 rounded-lg border-pos-border-subtle bg-pos-glass/80 text-xs font-semibold"
                        onClick={() => void runThermalTest(p)}
                      >
                        {thermalBusy
                          ? fr.settingsPage.printerTesting
                          : isKitchen
                            ? fr.settingsPage.printerTestKitchen
                            : fr.settingsPage.printerTestReceipt}
                      </Button>
                    ) : null}
                    {!p.isDefault ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={!p.isActive || defaultBusy}
                        className="h-9 rounded-lg border-pos-border-subtle bg-pos-glass/80 text-xs font-semibold"
                        onClick={() =>
                          void updatePrinter.mutate(
                            { printerId: p.id, body: { isDefault: true } },
                            { onSuccess: () => onToast(fr.settingsPage.printerSaved) },
                          )
                        }
                      >
                        {fr.settingsPage.printerSetDefault}
                      </Button>
                    ) : null}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-9 gap-1 rounded-lg border-pos-border-subtle bg-pos-glass/80 text-xs font-semibold"
                      onClick={() => openEdit(p)}
                    >
                      <Pencil className="size-3.5" aria-hidden />
                      {fr.settingsPage.edit}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-9 gap-1 rounded-lg border-rose-500/25 bg-rose-500/[0.08] text-xs font-semibold text-rose-100"
                      onClick={() => setDeleteTarget(p)}
                    >
                      <Trash2 className="size-3.5" aria-hidden />
                    </Button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <PrinterFormModal
        open={formOpen}
        onOpenChange={setFormOpen}
        mode={formMode}
        printer={editingPrinter}
        discovered={discoveredSeed}
        onSave={handleSave}
        onTestConnection={handleFormTest}
      />

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title={fr.settingsPage.printerDeleteTitle}
        description={fr.settingsPage.printerDeleteDesc.replace("{name}", deleteTarget?.name ?? "")}
        confirmLabel={fr.settingsPage.printerDeleteConfirm}
        destructive
        onConfirm={() => void handleDelete()}
      />
    </>
  );
}
