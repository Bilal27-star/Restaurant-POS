import {
  Building2,
  CircleDollarSign,
  Database,
  HardDrive,
  Pencil,
  Printer,
  RotateCcw,
  Trash2,
  Upload,
  Users,
} from "lucide-react";
import { useCallback, useEffect, useState, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PermissionCodes } from "@pos/contracts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CaisseAddEmployeePanel } from "@/components/caisse/caisse-add-employee-panel";
import type { CaisseEmployee } from "@/components/caisse/caisse-financial-types";
import { useCaisseStore } from "@/components/caisse/caisse-store";
import { ConfirmDialog } from "@/components/menu/confirm-dialog";
import { usePermission } from "@/auth/use-permission";
import { PageQueryState } from "@/components/data/page-query-state";
import { PageShell } from "@/components/data/page-shell";
import { usePageRouteDiagnostics } from "@/hooks/use-page-route-diagnostics";
import { getAppApi } from "@/lib/app-api";
import { isTauriDesktop } from "@/lib/desktop/tauri-host";
import { fr } from "@/lib/locale/fr";
import { cn } from "@/lib/utils";
import { PrinterManager } from "@/services/printing";
import { useUsersQuery, useUserMutations } from "@/hooks/use-users-queries";
import { useSystemSettingsQuery, useSystemSettingsMutations } from "@/hooks/use-settings-queries";
import {
  buildReceiptSettingsPatch,
  buildUserCreateBody,
  buildUserPatchBody,
  mapApiUserToCaisseEmployee,
  readReceiptLinesFromSettingsJson,
  type ApiUserListRow,
} from "@/lib/users/user-form-utils";

const settingsCard = cn(
  "rounded-[20px] border border-pos-border-subtle/90 bg-pos-glass/[0.45] p-6 shadow-surface-md ring-1 ring-violet-500/[0.07] backdrop-blur-sm md:p-8",
  "transition-[box-shadow,border-color,transform] duration-200 ease-out",
  "hover:border-zinc-600/55 hover:shadow-surface-hover hover:-translate-y-0.5 motion-reduce:hover:translate-y-0",
);

const fieldClass = cn(
  "h-12 w-full rounded-xl border border-pos-border-subtle bg-pos-depth/60 text-[15px] font-medium text-foreground placeholder:text-muted-foreground",
  "shadow-[inset_0_0_0_1px_rgb(129_140_248/0.12)] transition-[border-color,box-shadow] duration-200",
  "focus-visible:border-pos-violet-glow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pos-neon-magenta/25 focus-visible:ring-offset-0",
);

function statusLabel(s: CaisseEmployee["status"]): { label: string; className: string } {
  switch (s) {
    case "active":
      return { label: fr.settingsPage.statusActive, className: "border-emerald-500/35 bg-emerald-500/12 text-emerald-200" };
    case "break":
      return { label: fr.settingsPage.statusBreak, className: "border-amber-500/35 bg-amber-500/12 text-amber-100" };
    default:
      return { label: fr.settingsPage.statusOff, className: "border-zinc-600/50 bg-zinc-800/60 text-zinc-300" };
  }
}

function formatPrinterConnection(cj: unknown): string {
  if (!cj || typeof cj !== "object") return "—";
  const o = cj as Record<string, unknown>;
  const t = o.transport;
  if (t === "tcp") return `${String(o.host ?? "?")}:${String(o.port ?? 9100)}`;
  if (t === "usb") return String(o.devicePath ?? "USB");
  if (t === "file") return String(o.path ?? "fichier");
  return "JSON";
}

function printerRoleLabelFr(role: string): string {
  switch (role) {
    case "KITCHEN":
      return "Cuisine";
    case "RECEIPT":
      return "Tickets";
    case "CASHIER":
      return "Caisse";
    default:
      return role;
  }
}

type ApiPrinterRow = {
  id: string;
  name: string;
  role: string;
  driver: string;
  connectionJson: unknown;
  paperWidthChars: number;
  isDefault: boolean;
  isActive: boolean;
};

type SettingsApiUser = ApiUserListRow;

export function SettingsPage() {
  usePageRouteDiagnostics("settings");
  const usersQuery = useUsersQuery();
  const { data: usersData = [] } = usersQuery;
  const { createUser, patchUser } = useUserMutations();
  
  const employees: CaisseEmployee[] = useMemo(
    () => usersData.map((u) => mapApiUserToCaisseEmployee(u)),
    [usersData],
  );

  const systemSettingsQuery = useSystemSettingsQuery();
  const { data: systemData } = systemSettingsQuery;
  const { patchSystemSettings } = useSystemSettingsMutations();

  const queryClient = useQueryClient();
  const canThermalPrint = usePermission(PermissionCodes.PRINTING_USE);

  const [restaurantName, setRestaurantName] = useState("");
  const [address, setAddress] = useState("");
  const [restaurantPhone, setRestaurantPhone] = useState("");
  const [currency, setCurrency] = useState("DA");
  const [taxRate, setTaxRate] = useState("19");
  const [receiptHeader, setReceiptHeader] = useState("");
  const [receiptFooter, setReceiptFooter] = useState("");

  useEffect(() => {
    if (systemData) {
      setRestaurantName(systemData.restaurantName || "");
      setAddress(systemData.address || "");
      setRestaurantPhone(systemData.phone || "");
      const sj = (systemData.settingsJson || {}) as Record<string, unknown>;
      setCurrency(typeof sj.currency === "string" ? sj.currency : "DA");
      setTaxRate(String(sj.taxRate ?? "19"));
      const receiptLines = readReceiptLinesFromSettingsJson(sj);
      setReceiptHeader(receiptLines.header);
      setReceiptFooter(receiptLines.footer);
    }
  }, [systemData]);

  const [thermalWorkerRunning, setThermalWorkerRunning] = useState(false);
  useEffect(() => {
    if (!isTauriDesktop()) return;
    const id = window.setInterval(() => {
      setThermalWorkerRunning(PrinterManager.isWorkerRunning());
    }, 1500);
    setThermalWorkerRunning(PrinterManager.isWorkerRunning());
    return () => window.clearInterval(id);
  }, []);

  const printersQuery = useQuery({
    queryKey: ["print", "printers"],
    queryFn: async () => (await getAppApi().print.listPrinters()) as ApiPrinterRow[],
    enabled: canThermalPrint,
    staleTime: 15_000,
  });

  const setDefaultPrinter = useMutation({
    mutationFn: (printerId: string) => getAppApi().print.updatePrinter(printerId, { isDefault: true }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["print", "printers"] });
    },
  });

  const [employeePanelOpen, setEmployeePanelOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<CaisseEmployee | null>(null);
  const [editingUserRow, setEditingUserRow] = useState<SettingsApiUser | null>(null);
  const [clearOpen, setClearOpen] = useState(false);

  const [toast, setToast] = useState<string | null>(null);
  const [testBusyPrinterId, setTestBusyPrinterId] = useState<string | null>(null);
  const flash = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 3200);
  }, []);

  const handlePanelOpenChange = (open: boolean) => {
    setEmployeePanelOpen(open);
    if (!open) {
      setEditingEmployee(null);
      setEditingUserRow(null);
    }
  };

  const openAddUser = () => {
    setEditingEmployee(null);
    setEditingUserRow(null);
    setEmployeePanelOpen(true);
  };

  const openEditUser = (emp: CaisseEmployee) => {
    const row = usersData.find((u: { id: string }) => u.id === emp.id) as SettingsApiUser | undefined;
    setEditingEmployee(emp);
    setEditingUserRow(row ?? null);
    setEmployeePanelOpen(true);
  };

  const handleSaveAll = async () => {
    try {
      const existingJson = (systemData?.settingsJson ?? {}) as Record<string, unknown>;
      await patchSystemSettings.mutateAsync({
        restaurantName,
        address,
        phone: restaurantPhone,
        settingsJson: {
          ...existingJson,
          currency,
          taxRate: parseFloat(taxRate) || 0,
          ...buildReceiptSettingsPatch(receiptHeader, receiptFooter, existingJson),
        },
      });
      flash(fr.settingsPage.savedToast);
    } catch (e: unknown) {
      flash(e instanceof Error ? e.message : "Erreur de sauvegarde");
    }
  };

  const runTestKitchen = async (printerId: string) => {
    setTestBusyPrinterId(printerId);
    try {
      await PrinterManager.testKitchen(printerId);
      flash(fr.settingsPage.printerTestOk);
    } catch {
      flash(fr.settingsPage.printerTestErr);
    } finally {
      setTestBusyPrinterId(null);
    }
  };

  const runTestReceipt = async (printerId: string) => {
    setTestBusyPrinterId(printerId);
    try {
      await PrinterManager.testReceipt(printerId);
      flash(fr.settingsPage.printerTestOk);
    } catch {
      flash(fr.settingsPage.printerTestErr);
    } finally {
      setTestBusyPrinterId(null);
    }
  };

  const pageLoading =
    (usersQuery.isLoading && usersData.length === 0) ||
    (systemSettingsQuery.isLoading && !systemData);
  const pageError = usersQuery.isError || systemSettingsQuery.isError;
  const pageErr = usersQuery.error ?? systemSettingsQuery.error;

  return (
    <PageShell>
    <PageQueryState
      label="les paramètres"
      isLoading={pageLoading}
      isError={pageError}
      error={pageErr}
      onRetry={() => {
        void usersQuery.refetch();
        void systemSettingsQuery.refetch();
        void printersQuery.refetch();
      }}
    >
    <div className="relative pb-28 md:pb-32">
      {toast ? (
        <div
          className="fixed bottom-24 left-1/2 z-[90] max-w-md -translate-x-1/2 rounded-xl border border-pos-border-subtle bg-pos-depth/95 px-4 py-3 text-center text-sm font-semibold text-foreground shadow-surface-lg ring-1 ring-black/[0.06] backdrop-blur-md md:bottom-28"
          role="status"
        >
          {toast}
        </div>
      ) : null}

      <header className="mb-10 border-b border-white/[0.08] pb-8 md:mb-12 md:pb-10">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div className="min-w-0 space-y-2">
            <h1 className="text-2xl font-semibold tracking-tight text-white md:text-3xl">{fr.settingsPage.title}</h1>
            <p className="max-w-2xl text-sm font-medium leading-relaxed text-slate-300 md:text-[0.9375rem]">
              {fr.settingsPage.subtitle}
            </p>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-3xl space-y-10 md:space-y-12">
        <section className={settingsCard} aria-labelledby="settings-restaurant">
          <div className="mb-6 flex items-center gap-3">
            <div className="flex size-11 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500/25 to-fuchsia-500/20 ring-1 ring-violet-500/25">
              <Building2 className="size-5 text-violet-200" aria-hidden />
            </div>
            <div>
              <h2 id="settings-restaurant" className="text-lg font-bold tracking-tight text-white md:text-xl">
                {fr.settingsPage.restaurantInfo}
              </h2>
              <p className="text-xs font-medium text-slate-400">{fr.settingsPage.restaurantInfoHint}</p>
            </div>
          </div>
          <div className="space-y-5">
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-200" htmlFor="set-name">
                {fr.settingsPage.restaurantName}
              </label>
              <Input id="set-name" value={restaurantName} onChange={(e) => setRestaurantName(e.target.value)} className={fieldClass} />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-200" htmlFor="set-address">
                {fr.settingsPage.address}
              </label>
              <Input id="set-address" value={address} onChange={(e) => setAddress(e.target.value)} className={fieldClass} />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-200" htmlFor="set-phone">
                {fr.settingsPage.phone}
              </label>
              <Input
                id="set-phone"
                value={restaurantPhone}
                onChange={(e) => setRestaurantPhone(e.target.value)}
                className={fieldClass}
                inputMode="tel"
              />
            </div>
          </div>
        </section>

        <section className={settingsCard} aria-labelledby="settings-financial">
          <div className="mb-6 flex items-center gap-3">
            <div className="flex size-11 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500/25 to-yellow-500/20 ring-1 ring-amber-500/25">
              <CircleDollarSign className="size-5 text-amber-200" aria-hidden />
            </div>
            <div>
              <h2 id="settings-financial" className="text-lg font-bold tracking-tight text-white md:text-xl">
                Finance & Tickets
              </h2>
              <p className="text-xs font-medium text-slate-400">Devise, taxes et entête des reçus</p>
            </div>
          </div>
          <div className="space-y-6">
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-200" htmlFor="set-currency">
                  Devise
                </label>
                <Input id="set-currency" value={currency} onChange={(e) => setCurrency(e.target.value)} className={fieldClass} placeholder="DA" />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-200" htmlFor="set-tax">
                  TVA (%)
                </label>
                <Input id="set-tax" type="number" value={taxRate} onChange={(e) => setTaxRate(e.target.value)} className={fieldClass} placeholder="19" />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-200" htmlFor="set-header">
                Entête du ticket
              </label>
              <textarea id="set-header" value={receiptHeader} onChange={(e) => setReceiptHeader(e.target.value)} className={cn(fieldClass, "min-h-[5rem] py-3")} placeholder="Nom du restaurant..." />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-200" htmlFor="set-footer">
                Pied de page du ticket
              </label>
              <textarea id="set-footer" value={receiptFooter} onChange={(e) => setReceiptFooter(e.target.value)} className={cn(fieldClass, "min-h-[5rem] py-3")} placeholder="Merci de votre visite !" />
            </div>
          </div>
        </section>

        <section className={settingsCard} aria-labelledby="settings-users">
          <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-start gap-3">
              <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-fuchsia-500/25 to-orange-500/15 ring-1 ring-fuchsia-500/20">
                <Users className="size-5 text-fuchsia-200" aria-hidden />
              </div>
              <div>
                <h2 id="settings-users" className="text-lg font-bold tracking-tight text-white md:text-xl">
                  {fr.settingsPage.userManagement}
                </h2>
                <p className="mt-0.5 text-xs font-medium text-slate-400">{fr.settingsPage.userManagementHint}</p>
              </div>
            </div>
            <Button
              type="button"
              onClick={openAddUser}
              className="h-11 shrink-0 gap-2 rounded-[14px] border-0 bg-gradient-to-r from-[#7c3aed] to-[#db2777] px-5 text-sm font-bold text-white shadow-indigo-900/20 transition hover:from-[#8b5cf6] hover:to-[#ec4899] hover:shadow-surface-md active:scale-[0.99]"
            >
              <span className="text-base font-extrabold leading-none">+</span>
              {fr.settingsPage.addUser}
            </Button>
          </div>
          <ul className="divide-y divide-white/[0.06] rounded-xl border border-white/[0.06] bg-[#0c0c10]/50 ring-1 ring-black/[0.2]">
            {employees.map((emp) => {
              const st = statusLabel(emp.status);
              return (
                <li
                  key={emp.id}
                  className="flex flex-wrap items-center gap-3 px-4 py-3.5 transition-colors duration-200 first:rounded-t-xl last:rounded-b-xl hover:bg-white/[0.04]"
                >
                  <div
                    className={cn(
                      "flex size-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br text-xs font-bold text-white ring-2 ring-white/10",
                      emp.avatarGradient,
                    )}
                  >
                    {emp.avatarInitials}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-white">{emp.name}</p>
                    <p className="truncate text-sm font-medium text-slate-400">{emp.role}</p>
                  </div>
                  <span
                    className={cn(
                      "shrink-0 rounded-full border px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide",
                      st.className,
                    )}
                  >
                    {st.label}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-9 shrink-0 gap-1.5 rounded-lg border-pos-border-subtle bg-pos-glass/80 text-xs font-semibold text-foreground hover:bg-secondary"
                    onClick={() => openEditUser(emp)}
                  >
                    <Pencil className="size-3.5" aria-hidden />
                    {fr.settingsPage.edit}
                  </Button>
                </li>
              );
            })}
          </ul>
        </section>

        <section className={settingsCard} aria-labelledby="settings-printers">
          <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex size-11 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500/20 to-teal-500/10 ring-1 ring-emerald-500/25">
                <Printer className="size-5 text-emerald-200" aria-hidden />
              </div>
              <div>
                <h2 id="settings-printers" className="text-lg font-bold tracking-tight text-white md:text-xl">
                  {fr.settingsPage.printerSettings}
                </h2>
                <p className="text-xs font-medium text-slate-400">{fr.settingsPage.printerHint}</p>
              </div>
            </div>
            {canThermalPrint && isTauriDesktop() ? (
              <div className="max-w-md rounded-xl border border-pos-border-subtle/80 bg-pos-depth/50 px-3 py-2.5 text-xs font-medium leading-snug text-slate-300">
                <p className="font-semibold text-slate-200">{fr.settingsPage.printerThermalQueue}</p>
                <p className={cn("mt-1", thermalWorkerRunning ? "text-emerald-300" : "text-amber-200/90")}>
                  {thermalWorkerRunning ? fr.settingsPage.printerQueueRunning : fr.settingsPage.printerQueueStopped}
                </p>
              </div>
            ) : null}
          </div>

          {!canThermalPrint ? (
            <p className="text-sm font-medium leading-relaxed text-amber-200/90">{fr.settingsPage.printerNoPermission}</p>
          ) : printersQuery.isLoading ? (
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
                const testBusy = testBusyPrinterId === p.id;
                const defaultBusy = setDefaultPrinter.isPending && setDefaultPrinter.variables === p.id;
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
                            {p.isDefault ? (
                              <span className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-200">
                                {fr.settingsPage.printerDefaultBadge}
                              </span>
                            ) : null}
                            {!p.isActive ? (
                              <span className="rounded-md border border-zinc-600/50 bg-zinc-800/80 px-2 py-0.5 text-[10px] font-bold uppercase text-zinc-400">
                                {fr.settingsPage.offline}
                              </span>
                            ) : null}
                          </div>
                          <p className="mt-1 font-mono text-xs tabular-nums text-slate-400">{formatPrinterConnection(p.connectionJson)}</p>
                          <p className="mt-0.5 text-[11px] text-slate-500">
                            {p.driver} · {p.paperWidthChars} cols
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2 sm:justify-end">
                        {isKitchen ? (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={!p.isActive || testBusy}
                            className="h-9 rounded-lg border-pos-border-subtle bg-pos-glass/80 text-xs font-semibold"
                            onClick={() => void runTestKitchen(p.id)}
                          >
                            {testBusy ? fr.settingsPage.printerTesting : fr.settingsPage.printerTestKitchen}
                          </Button>
                        ) : null}
                        {isReceiptStation ? (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={!p.isActive || testBusy}
                            className="h-9 rounded-lg border-pos-border-subtle bg-pos-glass/80 text-xs font-semibold"
                            onClick={() => void runTestReceipt(p.id)}
                          >
                            {testBusy ? fr.settingsPage.printerTesting : fr.settingsPage.printerTestReceipt}
                          </Button>
                        ) : null}
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={!p.isActive || defaultBusy || p.isDefault}
                          className="h-9 rounded-lg border-pos-border-subtle bg-pos-glass/80 text-xs font-semibold"
                          onClick={() => setDefaultPrinter.mutate(p.id)}
                        >
                          {defaultBusy ? "…" : fr.settingsPage.printerSetDefault}
                        </Button>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 border-t border-white/[0.06] pt-2">
                      <span className="relative flex size-2.5">
                        <span
                          className={cn(
                            "absolute inset-0 rounded-full",
                            p.isActive ? "bg-emerald-400 shadow-[0_0_10px_2px_rgba(52,211,153,0.45)]" : "bg-zinc-600",
                          )}
                        />
                      </span>
                      <span className="text-xs font-semibold text-emerald-200/90">
                        {p.isActive ? fr.settingsPage.connected : fr.settingsPage.offline}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className={settingsCard} aria-labelledby="settings-system">
          <div className="mb-6 flex items-center gap-3">
            <div className="flex size-11 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500/20 to-indigo-500/15 ring-1 ring-sky-500/20">
              <Database className="size-5 text-sky-200" aria-hidden />
            </div>
            <div>
              <h2 id="settings-system" className="text-lg font-bold tracking-tight text-white md:text-xl">
                {fr.settingsPage.system}
              </h2>
              <p className="text-xs font-medium text-slate-400">{fr.settingsPage.systemHint}</p>
            </div>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <Button
              type="button"
              variant="outline"
              className="h-11 rounded-xl border-pos-border-subtle bg-pos-depth/50 px-5 text-sm font-semibold text-foreground shadow-sm transition hover:bg-pos-glass/80 hover:shadow-surface-xs"
              onClick={() => flash(fr.settingsPage.backupToast)}
            >
              <Upload className="mr-2 size-4 opacity-90" aria-hidden />
              {fr.settingsPage.backup}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-11 rounded-xl border-pos-border-subtle bg-pos-depth/50 px-5 text-sm font-semibold text-foreground shadow-sm transition hover:bg-pos-glass/80 hover:shadow-surface-xs"
              onClick={() => flash(fr.settingsPage.restoreToast)}
            >
              <RotateCcw className="mr-2 size-4 opacity-90" aria-hidden />
              {fr.settingsPage.restore}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-11 rounded-xl border-rose-500/25 bg-rose-500/[0.08] px-5 text-sm font-semibold text-rose-100 shadow-sm transition hover:border-rose-400/35 hover:bg-rose-500/15"
              onClick={() => setClearOpen(true)}
            >
              <Trash2 className="mr-2 size-4 opacity-90" aria-hidden />
              {fr.settingsPage.clearAll}
            </Button>
          </div>
        </section>
      </div>

      <div className="sticky bottom-0 z-20 mt-10 border-t border-white/[0.08] bg-gradient-to-t from-[#09090b] via-[#09090b]/98 to-[#09090b]/85 px-0 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur-md md:mt-12">
        <div className="mx-auto max-w-3xl">
          <Button
            type="button"
            onClick={() => void handleSaveAll()}
            disabled={patchSystemSettings.isPending}
            className="h-12 w-full rounded-[16px] border-0 bg-gradient-to-r from-[#7c3aed] to-[#db2777] text-sm font-bold text-white shadow-[0_12px_40px_-12px_rgba(124,58,237,0.45)] transition hover:from-[#8b5cf6] hover:to-[#ec4899] hover:shadow-[0_16px_48px_-14px_rgba(219,39,119,0.35)] active:scale-[0.99] disabled:opacity-60"
          >
            {patchSystemSettings.isPending ? "Enregistrement…" : fr.settingsPage.saveChanges}
          </Button>
        </div>
      </div>

      <CaisseAddEmployeePanel
        open={employeePanelOpen}
        onOpenChange={handlePanelOpenChange}
        editingEmployee={editingEmployee}
        editingSource={
          editingUserRow
            ? { username: editingUserRow.username, phone: editingUserRow.phone, email: editingUserRow.email }
            : null
        }
        onSave={async (input) => {
          try {
            await createUser.mutateAsync(buildUserCreateBody(input));
            flash(fr.settingsPage.teamAdded(input.fullName));
          } catch (e: unknown) {
            flash(e instanceof Error ? e.message : "Erreur");
            throw e;
          }
        }}
        onUpdate={async (id, input) => {
          try {
            await patchUser.mutateAsync({ id, body: buildUserPatchBody(input) });
            flash(fr.settingsPage.teamUpdated(input.fullName));
          } catch (e: unknown) {
            flash(e instanceof Error ? e.message : "Erreur");
            throw e;
          }
        }}
      />

      <ConfirmDialog
        open={clearOpen}
        onOpenChange={setClearOpen}
        title={fr.settingsPage.clearTitle}
        description={fr.settingsPage.clearDesc}
        confirmLabel={fr.settingsPage.clearConfirm}
        destructive
        onConfirm={() => flash(fr.settingsPage.clearToast)}
      />
    </div>
    </PageQueryState>
    </PageShell>
  );
}
