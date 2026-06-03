/**
 * End-of-day reconciliation: API + UI simulation vs database ground truth.
 * Run: cd apps/api && npx tsx ../../tmp/eod-audit.ts
 */
import { Prisma } from "@prisma/client";
import { prisma } from "../apps/api/src/prisma/index.ts";
import { businessDayBoundsUtc } from "../apps/api/src/modules/analytics/analytics-time.ts";

const API = "http://localhost:4000/api/v1";

type Mismatch = { check: string; expected: string; actual: string; delta?: string; note?: string };

function d(x: unknown): Prisma.Decimal {
  if (x == null || x === "") return new Prisma.Decimal(0);
  return new Prisma.Decimal(String(x));
}

function fmt(x: Prisma.Decimal | number | string): string {
  return d(x).toFixed(2);
}

async function api<T>(path: string, token: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(init?.headers ?? {}),
    },
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`${path} ${res.status}: ${JSON.stringify(body)}`);
  return body as T;
}

async function login() {
  const res = await fetch(`${API}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "admin", password: "admin", restaurantSlug: "default" }),
  });
  const body = await res.json();
  return {
    token: body.data.accessToken as string,
    restaurantId: body.data.user.restaurantId as string,
  };
}

/** Mirrors hydrateFromApi + computeShiftDrawerMetrics (current production code). */
function uiMetricsFromLedger(openingFloat: string, txs: { type: string; amount: string }[]) {
  let cashSales = d(0);
  let cardSales = d(0);
  let takeaway = d(0);
  let refunds = d(0);
  let expenses = d(0);

  for (const t of txs) {
    const amt = d(t.amount);
    if (t.type === "SALE_CASH") cashSales = cashSales.add(amt);
    else if (t.type === "SALE_CARD") cardSales = cardSales.add(amt);
    else if (t.type === "TAKEAWAY_CASH") takeaway = takeaway.add(amt);
    else if (t.type === "REFUND_OUT") refunds = refunds.add(amt.neg());
    else if (t.type === "EXPENSE_OUT") expenses = expenses.add(amt.neg());
    else if (t.type === "SALE_IN") cashSales = cashSales.add(amt); // hydrateFromApi default
  }

  const totalSales = cashSales.add(cardSales).add(takeaway);
  const netCash = cashSales.add(takeaway).sub(refunds).sub(expenses);
  const expectedDrawer = d(openingFloat).add(netCash);
  return {
    cashSalesDa: cashSales,
    cardSalesDa: cardSales,
    takeawayRevenueDa: takeaway,
    refundsDa: refunds,
    expensesDa: expenses,
    totalSalesDa: totalSales,
    netCashMovementDa: netCash,
    expectedDrawerCashDa: expectedDrawer,
  };
}

function check(mismatches: Mismatch[], name: string, expected: Prisma.Decimal | string, actual: Prisma.Decimal | string, note?: string) {
  const exp = d(expected);
  const act = d(actual);
  if (exp.sub(act).abs().gt("0.01")) {
    mismatches.push({
      check: name,
      expected: fmt(exp),
      actual: fmt(act),
      delta: fmt(act.sub(exp)),
      note,
    });
  }
}

async function main() {
  const mismatches: Mismatch[] = [];
  const notes: string[] = [];
  const { token, restaurantId } = await login();

  const { startUtc, endUtc, timeZone } = await businessDayBoundsUtc(restaurantId, new Date());
  console.log(`Business day (${timeZone}): ${startUtc.toISOString()} → ${endUtc.toISOString()}`);

  const [dashWrap, paymentsWrap, shiftWrap] = await Promise.all([
    api<{ data: Record<string, unknown> }>("/analytics/dashboard", token),
    api<{ data: Record<string, unknown> }>(
      `/analytics/payments?from=${encodeURIComponent(startUtc.toISOString())}&to=${encodeURIComponent(endUtc.toISOString())}`,
      token,
    ),
    api<{ data: { shift: Record<string, string> | null; cashTransactions: { type: string; amount: string }[] } }>(
      "/shifts/current",
      token,
    ),
  ]);
  const dashRoot = dashWrap.data as {
    today?: { revenue?: string; ordersOpened?: number; ordersCompleted?: number };
  };
  const dash = dashRoot.today ?? {};
  const paymentsApi = paymentsWrap.data as {
    completed: { totalAmount: string; byMethod: { method: string; total: string }[] };
    refunds: { totalAmount: string; count: number };
  };
  const shift = shiftWrap.data.shift;
  const cashTxsApi = shiftWrap.data.cashTransactions ?? [];

  const paymentDayWhere = {
    restaurantId,
    status: "COMPLETED" as const,
    OR: [
      { processedAt: { gte: startUtc, lt: endUtc } },
      { AND: [{ processedAt: null }, { createdAt: { gte: startUtc, lt: endUtc } }] },
    ],
  };

  const [
    ordersOpenedToday,
    ordersCompletedToday,
    cancelledToday,
    discountsToday,
    completedOrderTotals,
    completedPaidTotals,
    paymentsTodayAgg,
    paymentsTodayByMethod,
    refundsTodayAgg,
    ordersPaidMismatch,
    discountOrders,
    cancelledDetail,
  ] = await Promise.all([
    prisma.order.count({
      where: { restaurantId, status: { not: "CANCELLED" }, openedAt: { gte: startUtc, lt: endUtc } },
    }),
    prisma.order.count({
      where: { restaurantId, status: "COMPLETED", closedAt: { gte: startUtc, lt: endUtc } },
    }),
    prisma.order.count({
      where: { restaurantId, status: "CANCELLED", openedAt: { gte: startUtc, lt: endUtc } },
    }),
    prisma.order.aggregate({
      where: { restaurantId, status: { not: "CANCELLED" }, openedAt: { gte: startUtc, lt: endUtc } },
      _sum: { discountTotal: true },
    }),
    prisma.order.aggregate({
      where: { restaurantId, status: "COMPLETED", closedAt: { gte: startUtc, lt: endUtc } },
      _sum: { total: true, paidTotal: true },
    }),
    prisma.order.groupBy({
      by: ["type"],
      where: { restaurantId, status: "COMPLETED", closedAt: { gte: startUtc, lt: endUtc } },
      _sum: { total: true, paidTotal: true },
      _count: { _all: true },
    }),
    prisma.payment.aggregate({ where: paymentDayWhere, _sum: { amount: true }, _count: { _all: true } }),
    prisma.payment.groupBy({ by: ["method"], where: paymentDayWhere, _sum: { amount: true }, _count: { _all: true } }),
    prisma.refund.aggregate({
      where: { order: { restaurantId }, createdAt: { gte: startUtc, lt: endUtc } },
      _sum: { amount: true },
      _count: { _all: true },
    }),
    prisma.$queryRaw<{ cnt: bigint }[]>`
      SELECT COUNT(*)::bigint AS cnt FROM orders o
      WHERE o.restaurant_id = ${restaurantId}::uuid AND o.status = 'COMPLETED'
        AND o.closed_at >= ${startUtc} AND o.closed_at < ${endUtc}
        AND ABS(o.paid_total - COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p.order_id=o.id AND p.status='COMPLETED'),0)
          + COALESCE((SELECT SUM(r.amount) FROM refunds r WHERE r.order_id=o.id),0)) > 0.01`,
    prisma.order.aggregate({
      where: { restaurantId, discountTotal: { gt: 0 }, openedAt: { gte: startUtc, lt: endUtc } },
      _sum: { discountTotal: true },
      _count: { _all: true },
    }),
    prisma.order.aggregate({
      where: { restaurantId, status: "CANCELLED", openedAt: { gte: startUtc, lt: endUtc } },
      _sum: { total: true },
      _count: { _all: true },
    }),
  ]);

  const grossPaymentsToday = paymentsTodayAgg._sum.amount ?? d(0);
  const discountsSum = discountsToday._sum.discountTotal ?? d(0);
  const completedTotals = completedOrderTotals._sum.total ?? d(0);
  const completedPaid = completedOrderTotals._sum.paidTotal ?? d(0);
  const refundsToday = refundsTodayAgg._sum.amount ?? d(0);

  const dineInRow = completedPaidTotals.find((r) => r.type === "DINE_IN");
  const takeawayRow = completedPaidTotals.find((r) => r.type === "TAKEAWAY");

  // --- Daily revenue cross-checks ---
  check(mismatches, "Dashboard today.revenue vs sum(completed payments today)", grossPaymentsToday, dash.revenue ?? "0");
  check(
    mismatches,
    "Analytics payments.completed.total vs DB payments today",
    grossPaymentsToday,
    paymentsApi.completed.totalAmount,
  );
  check(mismatches, "Analytics refunds vs DB refunds today", refundsToday, paymentsApi.refunds.totalAmount);
  check(mismatches, "Dashboard today.ordersOpened vs DB", ordersOpenedToday, Number(dash.ordersOpened ?? 0));
  check(mismatches, "Dashboard today.ordersCompleted vs DB", ordersCompletedToday, Number(dash.ordersCompleted ?? 0));

  // Payment method breakdown
  for (const g of paymentsTodayByMethod) {
    const apiRow = paymentsApi.completed.byMethod.find((m) => m.method === g.method);
    check(
      mismatches,
      `Payment method ${g.method} total (analytics vs DB)`,
      g._sum.amount ?? d(0),
      apiRow?.total ?? "0",
    );
  }

  // Order integrity
  const paidMismatchCnt = Number(ordersPaidMismatch[0]?.cnt ?? 0);
  if (paidMismatchCnt > 0) {
    mismatches.push({
      check: "Completed orders where paid_total ≠ payments − refunds",
      expected: "0",
      actual: String(paidMismatchCnt),
      note: "order.paid_total denormalization drift",
    });
  }

  let shiftReport: Record<string, unknown> | null = null;
  if (shift) {
    const shiftId = shift.id;
    const shiftRow = await prisma.shift.findFirstOrThrow({ where: { id: shiftId, restaurantId } });
    const shiftPayments = await prisma.payment.aggregate({
      where: { shiftId, status: "COMPLETED" },
      _sum: { amount: true },
    });
    const shiftPaymentsByMethod = await prisma.payment.groupBy({
      by: ["method"],
      where: { shiftId, status: "COMPLETED" },
      _sum: { amount: true },
    });
    const shiftRefunds = await prisma.refund.aggregate({
      where: { payment: { shiftId } },
      _sum: { amount: true },
      _count: { _all: true },
    });
    const cashTxByType = await prisma.cashTransaction.groupBy({
      by: ["type"],
      where: { shiftId },
      _sum: { amount: true },
      _count: { _all: true },
    });
    const salesByOrderType = await prisma.payment.groupBy({
      by: ["orderId"],
      where: { shiftId, status: "COMPLETED" },
      _sum: { amount: true },
    });
    const orderIds = salesByOrderType.map((r) => r.orderId);
    const ordersForType = orderIds.length
      ? await prisma.order.findMany({ where: { id: { in: orderIds } }, select: { id: true, type: true } })
      : [];
    const typeByOrder = new Map(ordersForType.map((o) => [o.id, o.type]));
    let dineInShift = d(0);
    let takeawayShift = d(0);
    for (const row of salesByOrderType) {
      const typ = typeByOrder.get(row.orderId);
      const amt = row._sum.amount ?? d(0);
      if (typ === "DINE_IN") dineInShift = dineInShift.add(amt);
      else if (typ === "TAKEAWAY") takeawayShift = takeawayShift.add(amt);
    }

    const missingSaleIn = await prisma.payment.count({
      where: {
        shiftId,
        status: "COMPLETED",
        cashTransactions: { none: { type: "SALE_IN" } },
      },
    });
    const dupSaleIn = await prisma.$queryRaw<{ cnt: bigint }[]>`
      SELECT COUNT(*)::bigint AS cnt FROM (
        SELECT payment_id FROM cash_transactions
        WHERE shift_id = ${shiftId}::uuid AND payment_id IS NOT NULL
        GROUP BY payment_id HAVING COUNT(*) > 1
      ) x`;

    check(mismatches, "shift.gross_sales vs sum(payments in shift)", shiftPayments._sum.amount ?? d(0), shiftRow.grossSales);
    const cashPay = shiftPaymentsByMethod.find((m) => m.method === "CASH")?._sum.amount ?? d(0);
    const cardPay = shiftPaymentsByMethod.find((m) => m.method === "CARD")?._sum.amount ?? d(0);
    check(mismatches, "shift.cash_sales_total vs cash payments", cashPay, shiftRow.cashSalesTotal);
    check(mismatches, "shift.card_sales_total vs card payments", cardPay, shiftRow.cardSalesTotal);
    check(mismatches, "shift.refunds_total vs refunds in shift", shiftRefunds._sum.amount ?? d(0), shiftRow.refundsTotal);

    const saleIn = cashTxByType.find((t) => t.type === "SALE_IN")?._sum.amount ?? d(0);
    const expenseOut = (cashTxByType.find((t) => t.type === "EXPENSE_OUT")?._sum.amount ?? d(0)).neg();
    const refundOut = (cashTxByType.find((t) => t.type === "REFUND_OUT")?._sum.amount ?? d(0)).neg();
    const expectedDrawerDb = shiftRow.openingCashFloat.add(saleIn).sub(expenseOut).sub(refundOut);

    const uiMetrics = uiMetricsFromLedger(shiftRow.openingCashFloat.toFixed(2), cashTxsApi);
    check(
      mismatches,
      "UI Caisse totalSales vs shift.gross_sales",
      shiftRow.grossSales,
      uiMetrics.totalSalesDa,
      "SALE_IN mapped to cash only; card/takeaway buckets may be wrong in UI",
    );
    check(
      mismatches,
      "UI Caisse cashSales vs shift.cash_sales_total",
      shiftRow.cashSalesTotal,
      uiMetrics.cashSalesDa,
      "All SALE_IN txs counted as cash in UI regardless of payment method",
    );
    if (cardPay.gt(0) && uiMetrics.cardSalesDa.eq(0)) {
      notes.push(`UI shows 0 card sales but shift has ${fmt(cardPay)} DA card payments (SALE_IN type not split by method)`);
    }
    if (takeawayShift.gt(0) && uiMetrics.takeawayRevenueDa.eq(0)) {
      notes.push(`UI shows 0 takeaway revenue but shift has ${fmt(takeawayShift)} DA takeaway payments`);
    }
    const uiDineInKpi = uiMetrics.cashSalesDa.add(uiMetrics.cardSalesDa);
    if (uiDineInKpi.sub(dineInShift).abs().gt("0.01") && takeawayShift.gt(0)) {
      mismatches.push({
        check: "UI Caisse dine-in KPI (cash+card) vs DB DINE_IN payments",
        expected: fmt(dineInShift),
        actual: fmt(uiDineInKpi),
        delta: fmt(uiDineInKpi.sub(dineInShift)),
        note: "Takeaway cash counted as dine-in in caisse-page.tsx dineInDa",
      });
    }
    if (uiMetrics.takeawayRevenueDa.sub(takeawayShift).abs().gt("0.01")) {
      mismatches.push({
        check: "UI Caisse takeaway bucket vs DB TAKEAWAY payments",
        expected: fmt(takeawayShift),
        actual: fmt(uiMetrics.takeawayRevenueDa),
        delta: fmt(uiMetrics.takeawayRevenueDa.sub(takeawayShift)),
        note: "hydrateFromApi does not map SALE_IN + order type to takeaway",
      });
    }
    check(
      mismatches,
      "UI expected drawer vs DB cash ledger",
      expectedDrawerDb,
      uiMetrics.expectedDrawerCashDa,
      "Drawer UI uses misclassified SALE_IN rows",
    );

    if (missingSaleIn > 0) {
      mismatches.push({
        check: "Payments missing SALE_IN cash transaction",
        expected: "0",
        actual: String(missingSaleIn),
      });
    }
    if (Number(dupSaleIn[0]?.cnt ?? 0) > 0) {
      mismatches.push({
        check: "Duplicate cash_transaction per payment",
        expected: "0",
        actual: String(dupSaleIn[0]?.cnt),
      });
    }

    shiftReport = {
      shiftId,
      denormalized: {
        grossSales: fmt(shiftRow.grossSales),
        cashSales: fmt(shiftRow.cashSalesTotal),
        cardSales: fmt(shiftRow.cardSalesTotal),
        refundsTotal: fmt(shiftRow.refundsTotal),
        openingFloat: fmt(shiftRow.openingCashFloat),
      },
      recomputed: {
        paymentsGross: fmt(shiftPayments._sum.amount ?? d(0)),
        cashPayments: fmt(cashPay),
        cardPayments: fmt(cardPay),
        refunds: fmt(shiftRefunds._sum.amount ?? d(0)),
      },
      salesByOrderType: {
        DINE_IN: fmt(dineInShift),
        TAKEAWAY: fmt(takeawayShift),
      },
      cashLedger: Object.fromEntries(
        cashTxByType.map((t) => [t.type, { total: fmt(t._sum.amount ?? d(0)), count: t._count._all }]),
      ),
      drawerBalanceDb: {
        opening: fmt(shiftRow.openingCashFloat),
        saleIn: fmt(saleIn),
        expensesOut: fmt(expenseOut),
        refundsOut: fmt(refundOut),
        expectedCash: fmt(expectedDrawerDb),
      },
      uiMetricsSimulated: Object.fromEntries(Object.entries(uiMetrics).map(([k, v]) => [k, fmt(v as Prisma.Decimal)])),
      apiCashTxCount: cashTxsApi.length,
    };
  }

  const report = {
    verdict: mismatches.length === 0 ? "READY" : "NOT READY",
    mismatchCount: mismatches.length,
    mismatches,
    notes,
    businessDay: { timeZone, startUtc: startUtc.toISOString(), endUtc: endUtc.toISOString() },
    orders: {
      openedToday: ordersOpenedToday,
      completedToday: ordersCompletedToday,
      cancelledToday,
      discountsToday: fmt(discountsSum),
      discountOrdersCount: discountOrders._count._all,
      completedOrderTotals: fmt(completedTotals),
      completedPaidTotals: fmt(completedPaid),
      dineInCompletedTotal: fmt(dineInRow?._sum.total ?? d(0)),
      takeawayCompletedTotal: fmt(takeawayRow?._sum.total ?? d(0)),
      dineInCompletedPaid: fmt(dineInRow?._sum.paidTotal ?? d(0)),
      takeawayCompletedPaid: fmt(takeawayRow?._sum.paidTotal ?? d(0)),
      cancelledNotInRevenue: { count: cancelledDetail._count._all, sumTotals: fmt(cancelledDetail._sum.total ?? d(0)) },
    },
    paymentsToday: {
      gross: fmt(grossPaymentsToday),
      count: paymentsTodayAgg._count._all,
      byMethod: paymentsTodayByMethod.map((g) => ({
        method: g.method,
        total: fmt(g._sum.amount ?? d(0)),
        count: g._count._all,
      })),
    },
    refundsToday: { total: fmt(refundsToday), count: refundsTodayAgg._count._all },
    dashboardApi: {
      todayRevenue: dash.revenue,
      ordersOpenedToday: dash.ordersOpened,
      ordersCompletedToday: dash.ordersCompleted,
    },
    currentShift: shiftReport,
  };

  console.log(JSON.stringify(report, null, 2));
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
