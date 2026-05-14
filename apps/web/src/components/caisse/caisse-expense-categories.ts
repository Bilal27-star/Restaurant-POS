import type { ExpenseCategory } from "./caisse-financial-types";

/** Operational expense categories (English labels for reports & add-expense UI). */
export const CAISSE_EXPENSE_CATEGORIES: ExpenseCategory[] = [
  { id: "ingredients", label: "Ingredients" },
  { id: "maintenance", label: "Maintenance" },
  { id: "cleaning", label: "Cleaning" },
  { id: "utilities", label: "Utilities" },
  { id: "delivery", label: "Delivery" },
  { id: "packaging", label: "Packaging" },
  { id: "salaries", label: "Salaries" },
  { id: "equipment", label: "Equipment" },
  { id: "marketing", label: "Marketing" },
  { id: "other", label: "Other" },
];

export function expenseCategoryLabel(id: string): string {
  return CAISSE_EXPENSE_CATEGORIES.find((c) => c.id === id)?.label ?? id;
}
