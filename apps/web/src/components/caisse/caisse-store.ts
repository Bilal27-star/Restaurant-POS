import { create } from "zustand";
import { initialsFromDisplayName } from "@/lib/user-initials";
import { expenseCategoryLabel } from "./caisse-expense-categories";
import type { CaisseEmployee, Expense, ExpensePaymentMethod, FinancialTransaction, FinancialTransactionKind, Shift } from "./caisse-financial-types";
function newId() {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `cf-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

const NEW_EMPLOYEE_GRADIENTS = [
  "from-violet-500 to-fuchsia-500",
  "from-orange-500 to-amber-500",
  "from-emerald-500 to-teal-500",
  "from-sky-500 to-indigo-500",
  "from-rose-500 to-pink-500",
  "from-cyan-500 to-blue-600",
] as const;

function employmentToEmployeeStatus(
  s: "active" | "suspended" | "vacation",
): CaisseEmployee["status"] {
  if (s === "suspended") return "off";
  if (s === "vacation") return "break";
  return "active";
}

/** Minimal payload for the local employees panel (full form lives in UI only). */
export interface AddCaisseEmployeeInput {
  fullName: string;
  role: string;
  employmentStatus: "active" | "suspended" | "vacation";
  username?: string;
  phone?: string;
  email?: string;
  /** Required for create; optional on update (set to change password). */
  password?: string;
}

function paymentMethodSnippet(method?: ExpensePaymentMethod): string {
  if (!method) return "";
  if (method === "cash") return "Cash";
  if (method === "card") return "Card";
  return "Bank transfer";
}

export interface ShiftDrawerMetrics {
  totalSalesDa: number;
  cashSalesDa: number;
  cardSalesDa: number;
  takeawayRevenueDa: number;
  expensesDa: number;
  refundsDa: number;
  /** Cash + takeaway in − refunds − expenses (excludes opening float) */
  netCashMovementDa: number;
  /** opening + drawer movements */
  expectedDrawerCashDa: number;
}

export function computeShiftDrawerMetrics(shift: Shift, transactions: FinancialTransaction[]): ShiftDrawerMetrics {
  const txs = transactions.filter((t) => t.shiftId === shift.id);
  let cashSalesDa = 0;
  let cardSalesDa = 0;
  let takeawayRevenueDa = 0;
  let refundsDa = 0;
  let expensesDa = 0;

  for (const t of txs) {
    if (t.kind === "sale_cash") cashSalesDa += t.amountDa;
    if (t.kind === "sale_card") cardSalesDa += t.amountDa;
    if (t.kind === "takeaway") takeawayRevenueDa += t.amountDa;
    if (t.kind === "refund") refundsDa += -t.amountDa;
    if (t.kind === "expense") expensesDa += -t.amountDa;
  }

  const totalSalesDa = cashSalesDa + cardSalesDa + takeawayRevenueDa;
  const netCashMovementDa = cashSalesDa + takeawayRevenueDa - refundsDa - expensesDa;
  const expectedDrawerCashDa = shift.openingCashDa + netCashMovementDa;

  return {
    totalSalesDa,
    cashSalesDa,
    cardSalesDa,
    takeawayRevenueDa,
    expensesDa,
    refundsDa,
    netCashMovementDa,
    expectedDrawerCashDa,
  };
}

export interface TakeawayDeliveryIngest {
  id: string;
  takeawayNumber: number;
  customerName: string;
  totalAmountDa: number;
  /** Prefer POS delivery timestamp; falls back to created in sync hook */
  deliveredAtMs?: number;
}

interface CaisseState {
  activeShift: Shift | null;
  lastClosedShift: Shift | null;
  expenses: Expense[];
  transactions: FinancialTransaction[];
  employees: CaisseEmployee[];

  openShift: (input: { cashierName: string; openingCashDa: number }) => void;
  closeShift: (input: { countedCashDa: number; notes: string }) => void;
  dismissLastClosedShift: () => void;

  addExpense: (input: {
    categoryId: string;
    amountDa: number;
    notes: string;
    description?: string;
    paymentMethod?: ExpensePaymentMethod;
    expenseDateMs?: number;
    attributedEmployeeId?: string;
  }) => void;
  addRefund: (input: { amountDa: number; notes: string; attributedEmployeeId?: string }) => void;
  addRegisterSale: (input: { amountDa: number; method: "cash" | "card"; label?: string }) => void;
  removeExpense: (expenseId: string) => void;

  /** Idempotent per order id for the active shift. */
  ingestTakeawayDelivery: (order: TakeawayDeliveryIngest) => void;

  addEmployee: (input: AddCaisseEmployeeInput) => void;
  updateEmployee: (id: string, input: AddCaisseEmployeeInput) => void;
  hydrateFromApi: (data: any) => void;
}

export const useCaisseStore = create<CaisseState>((set) => ({
  activeShift: null,
  lastClosedShift: null,
  expenses: [],
  transactions: [],
  employees: [],

  openShift: ({ cashierName, openingCashDa }) => {
    const name = cashierName.trim();
    if (!name || openingCashDa < 0) return;
    set((s) => {
      if (s.activeShift) return s;
      const tOpen = Date.now();
      const shift: Shift = {
        id: newId(),
        openedAtMs: tOpen,
        openingCashDa,
        cashierName: name,
      };
      const tx: FinancialTransaction = {
        id: newId(),
        shiftId: shift.id,
        kind: "shift_opened",
        amountDa: 0,
        label: `Ouverture de caisse — ${name} · ${openingCashDa.toLocaleString("fr-DZ")} DA`,
        createdAtMs: tOpen,
      };
      return { activeShift: shift, transactions: [...s.transactions, tx] };
    });
  },

  closeShift: ({ countedCashDa, notes }) => {
    set((s) => {
      if (!s.activeShift) return s;
      const shift = s.activeShift;
      const metrics = computeShiftDrawerMetrics(shift, s.transactions);
      const expected = metrics.expectedDrawerCashDa;
      const diff = countedCashDa - expected;
      const tClose = Date.now();
      const closed: Shift = {
        ...shift,
        closedAtMs: tClose,
        closingCountedCashDa: countedCashDa,
        expectedCashDa: expected,
        cashDifferenceDa: diff,
        closeNotes: notes.trim() || undefined,
      };
      const tx: FinancialTransaction = {
        id: newId(),
        shiftId: shift.id,
        kind: "shift_closed",
        amountDa: 0,
        label: `Clôture — compté ${countedCashDa.toLocaleString("fr-DZ")} DA · écart ${diff >= 0 ? "+" : ""}${diff.toLocaleString("fr-DZ")} DA`,
        createdAtMs: tClose,
      };
      return {
        activeShift: null,
        lastClosedShift: closed,
        transactions: [...s.transactions, tx],
      };
    });
  },

  dismissLastClosedShift: () => set({ lastClosedShift: null }),

  addExpense: ({
    categoryId,
    amountDa,
    notes,
    description,
    paymentMethod,
    expenseDateMs,
    attributedEmployeeId,
  }) => {
    const amount = Math.max(0, Math.round(amountDa));
    if (!amount) return;
    set((s) => {
      if (!s.activeShift) return s;
      const id = newId();
      const tMs = Date.now();
      const bookedMs = expenseDateMs ?? tMs;
      const descTrim = description?.trim();
      const exp: Expense = {
        id,
        shiftId: s.activeShift.id,
        categoryId,
        amountDa: amount,
        notes: notes.trim(),
        createdAtMs: tMs,
        attributedEmployeeId,
        description: descTrim || undefined,
        paymentMethod,
        expenseDateMs: bookedMs,
      };
      const labelParts = [`Dépense — ${expenseCategoryLabel(categoryId)}`];
      if (descTrim) labelParts.push(descTrim);
      const pay = paymentMethodSnippet(paymentMethod);
      if (pay) labelParts.push(pay);
      const tx: FinancialTransaction = {
        id: newId(),
        shiftId: s.activeShift.id,
        kind: "expense",
        amountDa: -amount,
        label: labelParts.join(" · "),
        createdAtMs: tMs,
        relatedExpenseId: id,
        attributedEmployeeId,
      };
      return {
        expenses: [...s.expenses, exp],
        transactions: [...s.transactions, tx],
      };
    });
  },

  addRefund: ({ amountDa, notes, attributedEmployeeId }) => {
    const amount = Math.max(0, Math.round(amountDa));
    if (!amount) return;
    set((s) => {
      if (!s.activeShift) return s;
      const tMs = Date.now();
      const tx: FinancialTransaction = {
        id: newId(),
        shiftId: s.activeShift.id,
        kind: "refund",
        amountDa: -amount,
        label: notes.trim() ? `Remboursement — ${notes.trim()}` : "Remboursement",
        createdAtMs: tMs,
        attributedEmployeeId,
      };
      return { transactions: [...s.transactions, tx] };
    });
  },

  addRegisterSale: ({ amountDa, method, label }) => {
    const amount = Math.max(0, Math.round(amountDa));
    if (!amount) return;
    set((s) => {
      if (!s.activeShift) return s;
      const tMs = Date.now();
      const kind = method === "cash" ? "sale_cash" : "sale_card";
      const tx: FinancialTransaction = {
        id: newId(),
        shiftId: s.activeShift.id,
        kind,
        amountDa: amount,
        label: label?.trim() || (method === "cash" ? "Encaissement espèces" : "Encaissement carte"),
        createdAtMs: tMs,
      };
      return { transactions: [...s.transactions, tx] };
    });
  },

  removeExpense: (expenseId) => {
    set((s) => {
      if (!s.activeShift) return s;
      const exp = s.expenses.find((e) => e.id === expenseId);
      if (!exp || exp.shiftId !== s.activeShift.id) return s;
      return {
        expenses: s.expenses.filter((e) => e.id !== expenseId),
        transactions: s.transactions.filter((t) => t.relatedExpenseId !== expenseId),
      };
    });
  },

  ingestTakeawayDelivery: (order) => {
    set((s) => {
      const shift = s.activeShift;
      const at = order.deliveredAtMs;
      if (!shift || at == null) return s;
      if (at < shift.openedAtMs) return s;
      if (s.transactions.some((t) => t.relatedOrderId === order.id && t.kind === "takeaway")) return s;
      const tx: FinancialTransaction = {
        id: newId(),
        shiftId: shift.id,
        kind: "takeaway",
        amountDa: order.totalAmountDa,
        label: `À emporter #${order.takeawayNumber} — ${order.customerName}`,
        createdAtMs: at,
        relatedOrderId: order.id,
      };
      return { transactions: [...s.transactions, tx] };
    });
  },

  addEmployee: ({ fullName, role, employmentStatus }) => {
    const name = fullName.trim();
    if (!name || !role.trim()) return;
    set((s) => {
      const id = newId();
      const hash =
        [...name].reduce((acc, ch) => acc + ch.charCodeAt(0), 0) + s.employees.length;
      const avatarGradient = NEW_EMPLOYEE_GRADIENTS[hash % NEW_EMPLOYEE_GRADIENTS.length]!;
      const emp: CaisseEmployee = {
        id,
        name,
        role: role.trim(),
        status: employmentToEmployeeStatus(employmentStatus),
        avatarInitials: initialsFromDisplayName(name),
        avatarGradient,
        contributionWeight: 0,
        performanceScore: 0,
      };
      return { employees: [...s.employees, emp] };
    });
  },

  updateEmployee: (id, { fullName, role, employmentStatus }) => {
    const name = fullName.trim();
    if (!name || !role.trim()) return;
    set((s) => ({
      employees: s.employees.map((e) =>
        e.id === id
          ? {
              ...e,
              name,
              role: role.trim(),
              status: employmentToEmployeeStatus(employmentStatus),
              avatarInitials: initialsFromDisplayName(name),
            }
          : e,
      ),
    }));
  },
  hydrateFromApi: (data) => {
    if (!data?.shift) {
      set({ activeShift: null });
      return;
    }
    const { shift, cashTransactions } = data;
    const activeShift: Shift = {
      id: shift.id,
      openedAtMs: new Date(shift.openedAt).getTime(),
      openingCashDa: Number.parseFloat(shift.openingCashFloat),
      cashierName: shift.openedBy?.fullName || "Staff",
    };
    const transactions: FinancialTransaction[] = (cashTransactions || []).map((t: any) => {
      let kind: FinancialTransactionKind = "sale_cash";
      if (t.type === "SALE_CASH") kind = "sale_cash";
      else if (t.type === "SALE_CARD") kind = "sale_card";
      else if (t.type === "TAKEAWAY_CASH") kind = "takeaway";
      else if (t.type === "EXPENSE_OUT") kind = "expense";
      else if (t.type === "REFUND_OUT") kind = "refund";

      return {
        id: t.id,
        shiftId: shift.id,
        kind,
        amountDa: Number.parseFloat(t.amount),
        label: t.label || (t.type === "EXPENSE_OUT" ? "Dépense" : "Vente"),
        createdAtMs: new Date(t.createdAt).getTime(),
        relatedOrderId: t.orderId,
        relatedExpenseId: t.expenseId,
      };
    });
    set({ activeShift, transactions });
  },
}));

export function selectActivityForShift(transactions: FinancialTransaction[], shiftId: string | null, limit = 40) {
  if (!shiftId) return [];
  return transactions
    .filter((t) => t.shiftId === shiftId)
    .sort((a, b) => b.createdAtMs - a.createdAtMs)
    .slice(0, limit);
}
