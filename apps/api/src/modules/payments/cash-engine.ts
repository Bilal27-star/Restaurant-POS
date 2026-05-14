import { Prisma } from "@prisma/client";

import { money } from "../../core/orders/money.js";

export type CashChangeResult = {
  billAmount: string;
  tenderedAmount: string;
  changeAmount: string;
  sufficient: boolean;
};

export function computeCashChange(bill: Prisma.Decimal, tendered: Prisma.Decimal): CashChangeResult {
  const change = tendered.sub(bill);
  return {
    billAmount: bill.toFixed(2),
    tenderedAmount: tendered.toFixed(2),
    changeAmount: change.toFixed(2),
    sufficient: !change.lt(money(0)),
  };
}
