import { ChevronDown, Loader2 } from "lucide-react";
import * as React from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { FloorDef, RestaurantTable } from "./tables-demo-data";
import { fr } from "@/lib/locale/fr";

export type TableFormMode = "add" | "edit";

export interface AddTableModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  floors: FloorDef[];
  /** Current toolbar floor — used when opening in add mode. */
  defaultFloorId: string;
  mode: TableFormMode;
  /** When `mode === "edit"`, the table being edited and its current floor. */
  editContext?: { table: RestaurantTable; floorId: string } | null;
  onSubmit: (payload: {
    mode: TableFormMode;
    floorId: string;
    table: RestaurantTable;
    previousFloorId?: string;
  }) => void | Promise<void>;
}

type FieldErrors = {
  tableNumber?: string;
  capacity?: string;
  floorId?: string;
};

function normalizeLabel(s: string) {
  return s.trim().toLowerCase();
}

function tableExistsOnFloor(
  numberLabel: string,
  floor: FloorDef | undefined,
  excludeTableId?: string,
) {
  if (!floor) return false;
  const key = normalizeLabel(numberLabel);
  if (!key) return false;
  return floor.tables.some(
    (t) => normalizeLabel(t.numberLabel) === key && (!excludeTableId || t.id !== excludeTableId),
  );
}

const inputShell =
  "h-11 min-h-11 rounded-[10px] border bg-zinc-900/50 px-3 text-base text-foreground shadow-none backdrop-blur-sm transition-[border-color,box-shadow,background-color] duration-200 placeholder:text-[color:var(--placeholder-foreground)] focus-visible:border-violet-400/50 focus-visible:ring-2 focus-visible:ring-violet-500/35";

export function AddTableModal({
  open,
  onOpenChange,
  floors,
  defaultFloorId,
  mode,
  editContext,
  onSubmit,
}: AddTableModalProps) {
  const [tableNumber, setTableNumber] = React.useState("");
  const [capacityStr, setCapacityStr] = React.useState("");
  const [floorId, setFloorId] = React.useState(defaultFloorId);
  const [errors, setErrors] = React.useState<FieldErrors>({});
  const [submitting, setSubmitting] = React.useState(false);
  const firstFieldRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (!open) {
      setSubmitting(false);
      setErrors({});
      return;
    }
    if (mode === "edit" && editContext) {
      setTableNumber(editContext.table.numberLabel);
      setCapacityStr(String(editContext.table.capacity ?? 4));
      setFloorId(editContext.floorId);
      setErrors({});
      requestAnimationFrame(() => firstFieldRef.current?.focus());
    } else {
      setTableNumber("");
      setCapacityStr("");
      setFloorId(defaultFloorId);
      setErrors({});
      requestAnimationFrame(() => firstFieldRef.current?.focus());
    }
  }, [open, mode, editContext, defaultFloorId]);

  const floor = floors.find((f) => f.id === floorId);
  const excludeId = mode === "edit" && editContext ? editContext.table.id : undefined;

  const validate = (): boolean => {
    const next: FieldErrors = {};
    const num = tableNumber.trim();
    if (!num) {
      next.tableNumber = fr.addTableModal.errNumberRequired;
    } else if (tableExistsOnFloor(num, floor, excludeId)) {
      next.tableNumber = fr.addTableModal.errNumberExists;
    }

    const capRaw = capacityStr.trim();
    if (!capRaw) {
      next.capacity = fr.addTableModal.errCapacityRequired;
    } else {
      const n = Number(capRaw);
      if (!Number.isInteger(n) || n < 1 || n > 99) {
        next.capacity = fr.addTableModal.errCapacityRange;
      }
    }

    if (!floorId || !floors.some((f) => f.id === floorId)) {
      next.floorId = fr.addTableModal.errFloor;
    }

    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    if (!validate()) return;

    const capacity = Number(capacityStr.trim());
    const numberLabel = tableNumber.trim();

    const table: RestaurantTable =
      mode === "edit" && editContext
        ? {
            ...editContext.table,
            numberLabel,
            capacity,
          }
        : {
            id:
              typeof crypto !== "undefined" && crypto.randomUUID
                ? crypto.randomUUID()
                : `t-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
            numberLabel,
            status: "free",
            capacity,
          };

    setSubmitting(true);
    try {
      await Promise.resolve(
        onSubmit({
          mode,
          floorId,
          table,
          previousFloorId: mode === "edit" && editContext ? editContext.floorId : undefined,
        }),
      );
      onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  };

  const blockDismissWhileBusy = React.useCallback((e: { preventDefault: () => void }) => {
    if (submitting) e.preventDefault();
  }, [submitting]);

  const isEdit = mode === "edit";
  const title = isEdit ? fr.addTableModal.editTitle : fr.addTableModal.addTitle;
  const descId = "table-form-desc";

  return (
    <Dialog open={open} onOpenChange={(next) => !submitting && onOpenChange(next)}>
      <DialogContent
        hideClose
        aria-describedby={descId}
        onPointerDownOutside={blockDismissWhileBusy}
        onInteractOutside={blockDismissWhileBusy}
        onEscapeKeyDown={blockDismissWhileBusy}
        className="surface-dark-ink overflow-hidden rounded-2xl border border-[rgba(173,70,255,0.3)] bg-gradient-to-br from-zinc-900 via-zinc-900 to-zinc-950 p-0 shadow-[0_25px_50px_rgba(0,0,0,0.45),0_0_80px_rgba(139,92,246,0.12)]"
      >
        <form onSubmit={handleSubmit} className="flex flex-col" noValidate>
          <div className="flex items-center justify-between border-b border-violet-500/20 bg-gradient-to-r from-violet-950/40 via-fuchsia-950/25 to-fuchsia-950/20 px-5 py-5">
            <DialogTitle className="text-[1.25rem] font-bold leading-7 tracking-tight text-white">{title}</DialogTitle>
            <DialogClose asChild>
              <button
                type="button"
                disabled={submitting}
                className="flex size-9 shrink-0 items-center justify-center rounded-[10px] text-white/90 transition-colors hover:bg-white/[0.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/70 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 disabled:pointer-events-none disabled:opacity-50"
                aria-label={fr.common.close}
              >
                <span className="relative block size-5">
                  <span className="absolute inset-x-1 top-1/2 h-0.5 -translate-y-1/2 rotate-45 rounded-full bg-current" />
                  <span className="absolute inset-x-1 top-1/2 h-0.5 -translate-y-1/2 -rotate-45 rounded-full bg-current" />
                </span>
              </button>
            </DialogClose>
          </div>

          <DialogDescription id={descId} className="sr-only">
            {isEdit ? fr.addTableModal.srEdit : fr.addTableModal.srAdd}
          </DialogDescription>

          <div className="flex flex-col gap-4 px-5 pb-2 pt-5">
            <div className="space-y-2">
              <label htmlFor="table-form-number" className="text-sm font-semibold text-on-dark-label">
                {fr.addTableModal.tableNumber} <span className="text-violet-300">*</span>
              </label>
              <Input
                ref={firstFieldRef}
                id="table-form-number"
                name="tableNumber"
                inputMode="text"
                autoComplete="off"
                placeholder={fr.addTableModal.placeholderNum}
                value={tableNumber}
                disabled={submitting}
                aria-invalid={Boolean(errors.tableNumber)}
                aria-describedby={errors.tableNumber ? "err-table-number" : undefined}
                onChange={(e) => {
                  setTableNumber(e.target.value);
                  if (errors.tableNumber) setErrors((er) => ({ ...er, tableNumber: undefined }));
                }}
                className={cn(
                  inputShell,
                  "border-violet-500/25",
                  errors.tableNumber &&
                    "border-red-400/55 ring-2 ring-red-500/25 animate-in fade-in duration-200",
                )}
              />
              {errors.tableNumber ? (
                <p
                  id="err-table-number"
                  className="text-sm text-red-300/95 animate-in fade-in slide-in-from-top-1 duration-200"
                  role="alert"
                >
                  {errors.tableNumber}
                </p>
              ) : null}
            </div>

            <div className="space-y-2">
              <label htmlFor="table-form-capacity" className="text-sm font-semibold text-on-dark-label">
                {fr.addTableModal.capacity} <span className="text-violet-300">*</span>
              </label>
              <Input
                id="table-form-capacity"
                name="capacity"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                autoComplete="off"
                placeholder={fr.addTableModal.placeholderCap}
                value={capacityStr}
                disabled={submitting}
                aria-invalid={Boolean(errors.capacity)}
                aria-describedby={errors.capacity ? "err-capacity" : undefined}
                onChange={(e) => {
                  setCapacityStr(e.target.value.replace(/\D/g, ""));
                  if (errors.capacity) setErrors((er) => ({ ...er, capacity: undefined }));
                }}
                className={cn(
                  inputShell,
                  "border-violet-500/25",
                  errors.capacity && "border-red-400/55 ring-2 ring-red-500/25 animate-in fade-in duration-200",
                )}
              />
              {errors.capacity ? (
                <p
                  id="err-capacity"
                  className="text-sm text-red-300/95 animate-in fade-in slide-in-from-top-1 duration-200"
                  role="alert"
                >
                  {errors.capacity}
                </p>
              ) : null}
            </div>

            <div className="space-y-2">
              <label htmlFor="table-form-floor" className="text-sm font-semibold text-on-dark-label">
                {fr.addTableModal.floor} <span className="text-violet-300">*</span>
              </label>
              <div className="relative">
                <select
                  id="table-form-floor"
                  name="floorId"
                  value={floorId}
                  disabled={submitting}
                  aria-invalid={Boolean(errors.floorId)}
                  onChange={(e) => {
                    setFloorId(e.target.value);
                    if (errors.floorId) setErrors((er) => ({ ...er, floorId: undefined }));
                  }}
                  className={cn(
                    inputShell,
                    "w-full cursor-pointer appearance-none border-violet-500/25 py-2 pr-10 focus-visible:outline-none disabled:cursor-not-allowed",
                    errors.floorId && "border-red-400/55 ring-2 ring-red-500/25",
                  )}
                >
                  {floors.map((f) => (
                    <option key={f.id} value={f.id} className="bg-zinc-900">
                      {f.name}
                    </option>
                  ))}
                </select>
                <ChevronDown
                  className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-on-dark-label"
                  aria-hidden
                />
              </div>
              {errors.floorId ? (
                <p className="text-sm text-red-300/95 animate-in fade-in slide-in-from-top-1 duration-200" role="alert">
                  {errors.floorId}
                </p>
              ) : null}
            </div>
          </div>

          <div className="mt-2 flex gap-2 border-t border-violet-500/20 bg-gradient-to-r from-violet-950/25 via-transparent to-fuchsia-950/20 px-4 py-4">
            <DialogClose asChild>
              <Button
                type="button"
                variant="secondary"
                disabled={submitting}
                className="h-11 min-h-11 shrink-0 rounded-[10px] border border-white/[0.06] bg-zinc-800 px-6 text-base font-medium text-white hover:bg-zinc-700"
              >
                {fr.addTableModal.cancel}
              </Button>
            </DialogClose>
            <Button
              type="submit"
              disabled={submitting}
              className="relative h-11 min-h-11 flex-1 rounded-[10px] border-0 bg-gradient-to-r from-violet-600 to-fuchsia-600 px-6 text-base font-semibold text-white shadow-[0_10px_28px_rgba(139,92,246,0.45)] transition-[filter,transform] hover:from-violet-500 hover:to-fuchsia-500 hover:shadow-[0_12px_36px_rgba(167,139,250,0.5)] active:translate-y-px disabled:opacity-70"
            >
              {submitting ? (
                <>
                  <Loader2 className="mr-2 size-[18px] animate-spin" aria-hidden />
                  {isEdit ? fr.addTableModal.saving : fr.addTableModal.adding}
                </>
              ) : isEdit ? (
                fr.addTableModal.save
              ) : (
                fr.addTableModal.add
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
