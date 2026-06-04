/** Caisse / cashier — frontend-only models (future: sync from API + realtime). */

export interface Shift {
  id: string;
  openedAtMs: number;
  closedAtMs?: number;
  openingCashDa: number;
  cashierName: string;
  /** Drawer count at close */
  closingCountedCashDa?: number;
  /** Theoretical drawer before count */
  expectedCashDa?: number;
  /** counted − expected */
  cashDifferenceDa?: number;
  closeNotes?: string;
}

export type FinancialTransactionKind =
  | "sale_cash"
  | "sale_card"
  | "takeaway"
  | "refund"
  | "expense"
  | "shift_opened"
  | "shift_closed";

/** Ledger + activity stream (append-only per shift). */
export interface FinancialTransaction {
  id: string;
  shiftId: string;
  kind: FinancialTransactionKind;
  /** Sales: positive DA. Refunds / expenses: negative DA. Shift markers: 0. */
  amountDa: number;
  label: string;
  createdAtMs: number;
  relatedOrderId?: string;
  relatedExpenseId?: string;
  /** Payment row for sale reprints (shift ledger). */
  paymentId?: string;
  attributedEmployeeId?: string;
}

export interface ExpenseCategory {
  id: string;
  label: string;
}

export type ExpensePaymentMethod = "cash" | "card" | "bank_transfer";

export interface Expense {
  id: string;
  shiftId: string;
  categoryId: string;
  amountDa: number;
  notes: string;
  createdAtMs: number;
  attributedEmployeeId?: string;
  /** Short line item (e.g. vendor / item). */
  description?: string;
  paymentMethod?: ExpensePaymentMethod;
  /** Calendar booking date (local midnight ms). */
  expenseDateMs?: number;
}

export interface CaisseEmployee {
  id: string;
  name: string;
  role: string;
  status: "active" | "break" | "off";
  avatarInitials: string;
  /** Tailwind gradient classes for avatar disc */
  avatarGradient: string;
  /** Share of shift sales attributed to this employee (0–1); from API when available */
  contributionWeight: number;
  /** Performance score 0–100; from API when available */
  performanceScore: number;
}
