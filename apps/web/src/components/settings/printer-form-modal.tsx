import { Loader2 } from "lucide-react";
import { useCallback, useEffect, useId, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { fr } from "@/lib/locale/fr";
import {
  KITCHEN_STATIONS,
  type ApiPrinter,
  type PrinterFormState,
  buildCreatePrinterBody,
  buildUpdatePrinterBody,
  emptyPrinterForm,
  formFromDiscovered,
  printerToForm,
  type KitchenStation,
  type PrinterRole,
} from "@/lib/printing/printer-form-utils";

const field = cn(
  "h-12 w-full rounded-xl border border-pos-border-subtle bg-pos-glass/90 text-[15px] font-medium text-foreground",
  "focus-visible:border-pos-violet-glow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pos-neon-magenta/25",
);

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "add" | "edit";
  printer: ApiPrinter | null;
  discovered?: { host: string; port: number; station?: KitchenStation } | null;
  onSave: (body: Record<string, unknown>) => Promise<void>;
  onTestConnection?: (host: string, port: number) => Promise<{ ok: boolean; message: string }>;
};

export function PrinterFormModal({
  open,
  onOpenChange,
  mode,
  printer,
  discovered,
  onSave,
  onTestConnection,
}: Props) {
  const formId = useId();
  const [form, setForm] = useState<PrinterFormState>(emptyPrinterForm());
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testMessage, setTestMessage] = useState<string | null>(null);

  const hydrate = useCallback(() => {
    if (mode === "edit" && printer) {
      setForm(printerToForm(printer));
    } else if (discovered) {
      setForm(formFromDiscovered(discovered.host, discovered.port, discovered.station));
    } else {
      setForm(emptyPrinterForm());
    }
    setTestMessage(null);
  }, [mode, printer, discovered]);

  useEffect(() => {
    if (open) hydrate();
  }, [open, hydrate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.host.trim()) return;
    setSaving(true);
    try {
      const body = mode === "edit" ? buildUpdatePrinterBody(form) : buildCreatePrinterBody(form);
      await onSave(body);
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    if (!onTestConnection || !form.host.trim()) return;
    setTesting(true);
    setTestMessage(null);
    try {
      const port = parseInt(form.port, 10) || 9100;
      const res = await onTestConnection(form.host.trim(), port);
      setTestMessage(res.message);
    } finally {
      setTesting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] w-[min(100vw-1.25rem,28rem)] overflow-y-auto rounded-[22px] border border-pos-border-subtle bg-pos-depth p-0">
        <div className="border-b border-white/[0.08] px-6 py-5">
          <DialogTitle className="text-lg font-bold text-white">
            {mode === "edit" ? fr.settingsPage.printerEditTitle : fr.settingsPage.printerAddTitle}
          </DialogTitle>
          <DialogDescription className="mt-1 text-sm text-slate-400">
            {fr.settingsPage.printerFormHint}
          </DialogDescription>
        </div>
        <form id={formId} className="space-y-4 px-6 py-5" onSubmit={(e) => void handleSubmit(e)}>
          <label className="block space-y-1.5">
            <span className="text-xs font-bold uppercase tracking-wide text-slate-400">{fr.settingsPage.printerName}</span>
            <Input className={field} value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} required />
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs font-bold uppercase tracking-wide text-slate-400">{fr.settingsPage.printerRole}</span>
            <select
              className={field}
              value={form.role}
              onChange={(e) => {
                const role = e.target.value as PrinterRole;
                setForm((p) => ({
                  ...p,
                  role,
                  kitchenStation: role === "KITCHEN" ? p.kitchenStation : "",
                }));
              }}
            >
              <option value="KITCHEN">Cuisine</option>
              <option value="RECEIPT">Tickets</option>
              <option value="CASHIER">Caisse</option>
            </select>
          </label>
          {form.role === "KITCHEN" ? (
            <label className="block space-y-1.5">
              <span className="text-xs font-bold uppercase tracking-wide text-slate-400">
                {fr.settingsPage.printerKitchenStation}
              </span>
              <select
                className={field}
                value={form.kitchenStation}
                onChange={(e) => setForm((p) => ({ ...p, kitchenStation: e.target.value as KitchenStation | "" }))}
              >
                <option value="">{fr.settingsPage.printerStationUnset}</option>
                {KITCHEN_STATIONS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <div className="grid grid-cols-2 gap-3">
            <label className="block space-y-1.5">
              <span className="text-xs font-bold uppercase tracking-wide text-slate-400">{fr.settingsPage.printerHost}</span>
              <Input className={field} value={form.host} onChange={(e) => setForm((p) => ({ ...p, host: e.target.value }))} required />
            </label>
            <label className="block space-y-1.5">
              <span className="text-xs font-bold uppercase tracking-wide text-slate-400">{fr.settingsPage.printerPort}</span>
              <Input className={field} value={form.port} onChange={(e) => setForm((p) => ({ ...p, port: e.target.value }))} inputMode="numeric" />
            </label>
          </div>
          <label className="block space-y-1.5">
            <span className="text-xs font-bold uppercase tracking-wide text-slate-400">{fr.settingsPage.printerPaperWidth}</span>
            <Input
              className={field}
              value={form.paperWidthChars}
              onChange={(e) => setForm((p) => ({ ...p, paperWidthChars: e.target.value }))}
              inputMode="numeric"
            />
          </label>
          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 text-sm font-medium text-slate-300">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(e) => setForm((p) => ({ ...p, isActive: e.target.checked }))}
                className="size-4 rounded border-pos-border-subtle"
              />
              {fr.settingsPage.printerActive}
            </label>
            <label className="flex items-center gap-2 text-sm font-medium text-slate-300">
              <input
                type="checkbox"
                checked={form.isDefault}
                onChange={(e) => setForm((p) => ({ ...p, isDefault: e.target.checked }))}
                className="size-4 rounded border-pos-border-subtle"
              />
              {fr.settingsPage.printerSetDefault}
            </label>
          </div>
          {testMessage ? (
            <p className={cn("text-sm font-medium", testMessage.includes("✓") ? "text-emerald-300" : "text-rose-300")}>
              {testMessage}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2 border-t border-white/[0.08] pt-4">
            {onTestConnection ? (
              <Button type="button" variant="outline" disabled={testing || !form.host.trim()} onClick={() => void handleTest()}>
                {testing ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                {fr.settingsPage.printerTestConnection}
              </Button>
            ) : null}
            <Button type="submit" disabled={saving} className="ml-auto">
              {saving ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
              {fr.settingsPage.printerSave}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
