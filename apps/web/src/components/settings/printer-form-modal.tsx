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
import { discoverLocalPrinters } from "@/lib/desktop/tauri-printer-discovery";
import { isTauriDesktop } from "@/lib/desktop/tauri-host";
import {
  KITCHEN_STATIONS,
  type ApiPrinter,
  type PrinterFormState,
  type PrinterTransport,
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
  preset?: Partial<PrinterFormState> | null;
  onSave: (body: Record<string, unknown>) => Promise<void>;
  onTestConnection?: (host: string, port: number) => Promise<{ ok: boolean; message: string }>;
};

export function PrinterFormModal({
  open,
  onOpenChange,
  mode,
  printer,
  discovered,
  preset,
  onSave,
  onTestConnection,
}: Props) {
  const formId = useId();
  const [form, setForm] = useState<PrinterFormState>(emptyPrinterForm());
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testMessage, setTestMessage] = useState<string | null>(null);
  const [localComPorts, setLocalComPorts] = useState<string[]>([]);
  const [localSpooler, setLocalSpooler] = useState<string[]>([]);
  const [loadingLocal, setLoadingLocal] = useState(false);

  const hydrate = useCallback(() => {
    if (mode === "edit" && printer) {
      setForm(printerToForm(printer));
    } else if (preset) {
      setForm({ ...emptyPrinterForm(), ...preset });
    } else if (discovered) {
      setForm(formFromDiscovered(discovered.host, discovered.port, discovered.station));
    } else {
      setForm(emptyPrinterForm());
    }
    setTestMessage(null);
  }, [mode, printer, discovered, preset]);

  useEffect(() => {
    if (open) hydrate();
  }, [open, hydrate]);

  const loadLocalDevices = async () => {
    if (!isTauriDesktop()) return;
    setLoadingLocal(true);
    try {
      const found = await discoverLocalPrinters();
      setLocalComPorts(found.comPorts);
      setLocalSpooler(found.spoolerPrinters);
    } finally {
      setLoadingLocal(false);
    }
  };

  useEffect(() => {
    if (!open || !isTauriDesktop()) return;
    if (form.transport === "usb" || form.transport === "winspool") {
      void loadLocalDevices();
    }
  }, [open, form.transport]);

  const validateForm = (): string | null => {
    if (!form.name.trim()) return "Nom requis";
    if (form.transport === "tcp" && !form.host.trim()) return "Adresse IP requise";
    if (form.transport === "usb" && !form.devicePath.trim()) return "Port COM / chemin requis";
    if (form.transport === "winspool" && !form.printerName.trim()) return "Nom de file d'impression Windows requis";
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const err = validateForm();
    if (err) {
      setTestMessage(err);
      return;
    }
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

  const onTransportChange = (transport: PrinterTransport) => {
    setForm((p) => ({
      ...p,
      transport,
      driver: transport === "tcp" ? "NETWORK_TCP" : "RAW_ESCPOS",
    }));
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

          <label className="block space-y-1.5">
            <span className="text-xs font-bold uppercase tracking-wide text-slate-400">
              {fr.settingsPage.printerTransport}
            </span>
            <select
              className={field}
              value={form.transport}
              onChange={(e) => onTransportChange(e.target.value as PrinterTransport)}
            >
              <option value="tcp">{fr.settingsPage.printerTransportTcp}</option>
              <option value="usb">{fr.settingsPage.printerTransportUsb}</option>
              <option value="winspool">{fr.settingsPage.printerTransportWinspool}</option>
            </select>
          </label>

          {form.transport === "tcp" ? (
            <div className="grid grid-cols-2 gap-3">
              <label className="block space-y-1.5">
                <span className="text-xs font-bold uppercase tracking-wide text-slate-400">{fr.settingsPage.printerHost}</span>
                <Input className={field} value={form.host} onChange={(e) => setForm((p) => ({ ...p, host: e.target.value }))} />
              </label>
              <label className="block space-y-1.5">
                <span className="text-xs font-bold uppercase tracking-wide text-slate-400">{fr.settingsPage.printerPort}</span>
                <Input className={field} value={form.port} onChange={(e) => setForm((p) => ({ ...p, port: e.target.value }))} inputMode="numeric" />
              </label>
            </div>
          ) : null}

          {form.transport === "usb" ? (
            <label className="block space-y-1.5">
              <span className="text-xs font-bold uppercase tracking-wide text-slate-400">
                {fr.settingsPage.printerComPort}
              </span>
              <select
                className={field}
                value={form.devicePath}
                onChange={(e) => setForm((p) => ({ ...p, devicePath: e.target.value }))}
              >
                <option value="">{loadingLocal ? "…" : "— Choisir —"}</option>
                {form.devicePath && !localComPorts.includes(form.devicePath) ? (
                  <option value={form.devicePath}>{form.devicePath}</option>
                ) : null}
                {localComPorts.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <Input
                className={cn(field, "mt-2")}
                value={form.devicePath}
                onChange={(e) => setForm((p) => ({ ...p, devicePath: e.target.value }))}
                placeholder="\\\\.\\COM3"
              />
            </label>
          ) : null}

          {form.transport === "winspool" ? (
            <label className="block space-y-1.5">
              <span className="text-xs font-bold uppercase tracking-wide text-slate-400">
                {fr.settingsPage.printerWindowsQueue}
              </span>
              <select
                className={field}
                value={form.printerName}
                onChange={(e) => setForm((p) => ({ ...p, printerName: e.target.value }))}
              >
                <option value="">{loadingLocal ? "…" : "— Choisir —"}</option>
                {form.printerName && !localSpooler.includes(form.printerName) ? (
                  <option value={form.printerName}>{form.printerName}</option>
                ) : null}
                {localSpooler.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
              <Input
                className={cn(field, "mt-2")}
                value={form.printerName}
                onChange={(e) => setForm((p) => ({ ...p, printerName: e.target.value }))}
                placeholder="XPrinter XP-80"
              />
            </label>
          ) : null}

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
            <p className={cn("text-sm font-medium", testMessage.includes("✓") || testMessage.includes("ms") ? "text-emerald-300" : "text-rose-300")}>
              {testMessage}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2 border-t border-white/[0.08] pt-4">
            {form.transport === "tcp" && onTestConnection ? (
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
