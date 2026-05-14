import { Check, Loader2, X } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { CAISSE_EXPENSE_CATEGORIES } from "./caisse-expense-categories";
import { fr } from "@/lib/locale/fr";
import type { ExpensePaymentMethod } from "./caisse-financial-types";

const SURFACE = "bg-[#111827]";
const FIELD = "bg-[#1f2937]";
const BORDER = "border-white/[0.08]";
const LABEL = "text-[#cbd5e1]";
const MUTED = "text-[#94a3b8]";

const fieldClass = cn(
  "flex min-h-11 w-full rounded-[14px] border px-3.5 text-sm font-medium text-white shadow-sm outline-none transition-[border-color,box-shadow]",
  BORDER,
  FIELD,
  "placeholder:text-[#64748b]",
  "hover:border-white/12",
  "focus-visible:border-violet-500/40 focus-visible:ring-2 focus-visible:ring-violet-500/25",
);

function todayIsoLocal(): string {
  const t = new Date();
  const y = t.getFullYear();
  const m = String(t.getMonth() + 1).padStart(2, "0");
  const d = String(t.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function localDateStartMs(iso: string): number {
  const [ys, ms, ds] = iso.split("-");
  const y = Number(ys);
  const mo = Number(ms);
  const day = Number(ds);
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(day)) return Date.now();
  return new Date(y, mo - 1, day, 0, 0, 0, 0).getTime();
}

function formatAmountDisplay(digits: string): string {
  if (!digits) return "";
  const n = Number(digits);
  if (!Number.isFinite(n) || n < 0) return "";
  return n.toLocaleString("fr-DZ");
}

export interface CaisseAddExpenseModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories?: { id: string; label: string }[];
  onSubmit: (input: {
    categoryId: string;
    amountDa: number;
    notes: string;
    description?: string;
    paymentMethod: ExpensePaymentMethod;
    expenseDateMs: number;
  }) => void;
}

type SubmitPhase = "idle" | "loading" | "success";

export function CaisseAddExpenseModal({ open, onOpenChange, categories, onSubmit }: CaisseAddExpenseModalProps) {
  const formId = useId();
  const categorySelectRef = useRef<HTMLSelectElement>(null);
  
  const effectiveCategories = categories && categories.length > 0 ? categories : CAISSE_EXPENSE_CATEGORIES;

  const [categoryId, setCategoryId] = useState(effectiveCategories[0]!.id);
  const [description, setDescription] = useState("");
  const [amountDigits, setAmountDigits] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<ExpensePaymentMethod>("cash");
  const [expenseDate, setExpenseDate] = useState(todayIsoLocal);
  const [notes, setNotes] = useState("");
  const [amountError, setAmountError] = useState(false);
  const [phase, setPhase] = useState<SubmitPhase>("idle");

  const reset = useCallback(() => {
    setCategoryId(effectiveCategories[0]!.id);
    setDescription("");
    setAmountDigits("");
    setPaymentMethod("cash");
    setExpenseDate(todayIsoLocal());
    setNotes("");
    setAmountError(false);
    setPhase("idle");
  }, [effectiveCategories]);

  useEffect(() => {
    if (open) {
      setExpenseDate(todayIsoLocal());
      setPhase("idle");
      setAmountError(false);
      if (!categoryId && effectiveCategories[0]) {
        setCategoryId(effectiveCategories[0].id);
      }
    }
  }, [open, categoryId, effectiveCategories]);

  const handleOpenChange = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  const onAmountChange = (raw: string) => {
    const digits = raw.replace(/\D/g, "").slice(0, 12);
    setAmountDigits(digits);
    if (digits) setAmountError(false);
  };

  const submitDisabled = phase === "loading" || phase === "success";

  const runSubmit = async () => {
    const amountDa = amountDigits ? Number(amountDigits) : 0;
    if (!amountDa) {
      setAmountError(true);
      return;
    }
    setPhase("loading");
    await new Promise((r) => setTimeout(r, 420));
    onSubmit({
      categoryId,
      amountDa,
      notes: notes.trim(),
      description: description.trim() || undefined,
      paymentMethod,
      expenseDateMs: localDateStartMs(expenseDate),
    });
    setPhase("success");
    await new Promise((r) => setTimeout(r, 720));
    reset();
    onOpenChange(false);
  };

  const overlayClass = cn(
    "!bg-black/55 backdrop-blur-xl",
    "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 duration-300 ease-out",
    "motion-reduce:data-[state=open]:animate-none motion-reduce:data-[state=closed]:animate-none",
  );

  const contentMotion = cn(
    SURFACE,
    "w-[min(100vw-1.5rem,31.25rem)] max-w-[min(100vw-1.5rem,31.25rem)] gap-0 overflow-hidden rounded-[20px] border p-0",
    BORDER,
    "shadow-[0_32px_120px_-28px_rgba(0,0,0,0.72)]",
    "duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
    "data-[state=open]:animate-in data-[state=closed]:animate-out",
    "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
    "data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
    "motion-reduce:data-[state=open]:animate-none motion-reduce:data-[state=closed]:animate-none",
  );

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        hideClose
        overlayClassName={overlayClass}
        className={contentMotion}
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          categorySelectRef.current?.focus();
        }}
      >
        <header
          className={cn(
            "flex items-start justify-between gap-4 border-b px-5 pb-4 pt-5 sm:px-6 sm:pb-5 sm:pt-6",
            BORDER,
          )}
        >
          <div className="min-w-0 space-y-1 pr-10">
            <DialogTitle className="text-left text-xl font-semibold tracking-tight text-white">
              Add Expense
            </DialogTitle>
            <DialogDescription className={cn("text-left text-sm font-medium leading-snug", MUTED)}>
              Register operational spending for analytics and reports
            </DialogDescription>
          </div>
          <button
            type="button"
            onClick={() => handleOpenChange(false)}
            className={cn(
              "absolute right-4 top-4 flex size-10 shrink-0 items-center justify-center rounded-xl border transition-colors",
              BORDER,
              "bg-[#1f2937]/90 text-[#94a3b8] hover:border-white/15 hover:bg-[#273549] hover:text-white",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/40",
            )}
            aria-label="Close"
          >
            <X className="size-5" />
          </button>
        </header>

        <form
          id={formId}
          className="max-h-[min(70vh,36rem)] overflow-y-auto px-5 py-5 sm:px-6"
          onSubmit={(e) => {
            e.preventDefault();
            void runSubmit();
          }}
        >
          <div className="space-y-5">
            <div className="space-y-1.5">
              <label className={cn("text-xs font-semibold", LABEL)} htmlFor={`${formId}-category`}>
                Category
              </label>
              <select
                ref={categorySelectRef}
                id={`${formId}-category`}
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className={cn(fieldClass, "h-11 cursor-pointer appearance-none pr-10 [color-scheme:dark]")}
                style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`, backgroundRepeat: "no-repeat", backgroundPosition: "right 12px center" }}
              >
                {effectiveCategories.map((c) => (
                  <option key={c.id} value={c.id} className="bg-[#111827] text-white">
                    {c.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className={cn("text-xs font-semibold", LABEL)} htmlFor={`${formId}-description`}>
                Description
              </label>
              <Input
                id={`${formId}-description`}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className={fieldClass}
                placeholder={fr.caisseExpenseModal.descPlaceholder}
                autoComplete="off"
              />
            </div>

            <div className="space-y-1.5">
              <label className={cn("text-xs font-semibold", LABEL)} htmlFor={`${formId}-amount`}>
                Amount (DA)
              </label>
              <Input
                id={`${formId}-amount`}
                value={formatAmountDisplay(amountDigits)}
                onChange={(e) => onAmountChange(e.target.value)}
                placeholder="0"
                inputMode="numeric"
                autoComplete="off"
                aria-invalid={amountError}
                className={cn(fieldClass, "font-mono tabular-nums tracking-tight", amountError && "border-rose-500/50 ring-1 ring-rose-500/25")}
              />
              {amountError ? (
                <p className="text-xs font-medium text-rose-400" role="alert">
                  Enter an amount to record this expense.
                </p>
              ) : null}
            </div>

            <div className="space-y-2">
              <p className={cn("text-xs font-semibold", LABEL)}>Payment method</p>
              <div className="flex flex-wrap gap-2">
                {(
                  [
                    { id: "cash" as const, label: "Cash" },
                    { id: "card" as const, label: "Card" },
                    { id: "bank_transfer" as const, label: "Bank Transfer" },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setPaymentMethod(opt.id)}
                    className={cn(
                      "rounded-xl border px-4 py-2 text-xs font-semibold transition-all",
                      BORDER,
                      paymentMethod === opt.id
                        ? "border-violet-500/40 bg-gradient-to-r from-violet-600/25 to-fuchsia-600/20 text-white shadow-[0_0_24px_-10px_rgba(139,92,246,0.45)]"
                        : "bg-[#1f2937]/60 text-[#cbd5e1] hover:border-white/12 hover:bg-[#1f2937]",
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <label className={cn("text-xs font-semibold", LABEL)} htmlFor={`${formId}-date`}>
                Expense date
              </label>
              <Input
                id={`${formId}-date`}
                type="date"
                value={expenseDate}
                onChange={(e) => setExpenseDate(e.target.value)}
                className={cn(fieldClass, "[color-scheme:dark]")}
              />
            </div>

            <div className="space-y-1.5">
              <label className={cn("text-xs font-semibold", LABEL)} htmlFor={`${formId}-notes`}>
                Notes <span className={cn("font-normal", MUTED)}>(optional)</span>
              </label>
              <textarea
                id={`${formId}-notes`}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={fr.caisseExpenseModal.notesPlaceholder}
                rows={3}
                className={cn(fieldClass, "min-h-[5.5rem] resize-none py-3 leading-relaxed")}
              />
            </div>
          </div>
        </form>

        <footer
          className={cn(
            "flex shrink-0 items-center justify-between gap-3 border-t px-5 py-4 sm:px-6",
            BORDER,
            "bg-[#111827]/98",
          )}
        >
          <Button
            type="button"
            variant="outline"
            disabled={submitDisabled}
            onClick={() => handleOpenChange(false)}
            className={cn(
              "h-11 rounded-xl border px-5 font-semibold",
              BORDER,
              "border-white/[0.08] bg-[#1f2937] text-white hover:bg-[#273549] hover:text-white",
            )}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            form={formId}
            disabled={submitDisabled}
            className={cn(
              "relative h-11 min-w-[11rem] overflow-hidden rounded-xl border-0 px-6 text-sm font-semibold text-white",
              "bg-gradient-to-r from-violet-600 to-fuchsia-600",
              "shadow-[0_10px_36px_-12px_rgba(168,85,247,0.55)]",
              "hover:from-violet-500 hover:to-fuchsia-500",
              "focus-visible:ring-2 focus-visible:ring-violet-400/45 focus-visible:ring-offset-2 focus-visible:ring-offset-[#111827]",
              phase === "success" && "from-emerald-600 to-teal-600 shadow-[0_10px_36px_-12px_rgba(45,212,191,0.4)]",
            )}
          >
            {phase === "loading" ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />
                Adding…
              </>
            ) : phase === "success" ? (
              <>
                <Check className="mr-2 size-4" aria-hidden />
                Saved
              </>
            ) : (
              "Add Expense"
            )}
          </Button>
        </footer>
      </DialogContent>
    </Dialog>
  );
}
