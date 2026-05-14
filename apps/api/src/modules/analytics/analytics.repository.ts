import { Prisma } from "@prisma/client";

import { prisma } from "../../prisma/index.js";
import { businessDayBoundsUtc, getRestaurantCurrency, getRestaurantTimeZone } from "./analytics-time.js";
import type {
  AnalyticsDashboardResponse,
  AnalyticsOverview,
  AnalyticsPaymentsResponse,
  AnalyticsPeakHoursResponse,
  AnalyticsRevenueResponse,
  AnalyticsTablesResponse,
  AnalyticsTopItemsResponse,
  RevenueGranularity,
} from "./analytics.types.js";

function d2s(v: Prisma.Decimal | null | undefined): string {
  return (v ?? new Prisma.Decimal(0)).toFixed(2);
}

function escapeTzLiteral(tz: string): string {
  return tz.replace(/'/g, "''");
}

export class AnalyticsRepository {
  /** Legacy overview (range in UTC from caller). */
  async overview(restaurantId: string, from: Date, to: Date): Promise<AnalyticsOverview> {
    const orderWhere = {
      restaurantId,
      openedAt: { gte: from, lte: to },
      status: { not: "CANCELLED" as const },
    };

    const categorySql = `
      SELECT mc.name AS name,
             SUM(oi.line_subtotal) AS revenue
      FROM order_items oi
      JOIN orders o ON oi.order_id = o.id
      JOIN menu_items mi ON oi.menu_item_id = mi.id
      JOIN menu_categories mc ON mi.category_id = mc.id
      WHERE o.restaurant_id = $1::uuid
        AND o.opened_at >= $2::timestamptz
        AND o.opened_at <= $3::timestamptz
        AND o.status <> 'CANCELLED'
      GROUP BY mc.name
      ORDER BY SUM(oi.line_subtotal) DESC NULLS LAST
      LIMIT 8`;

    const [
      paidAgg,
      ordersCount,
      activeTables,
      paymentGroups,
      topGroups,
      typeGroups,
      customerDistinct,
      categoryRows,
      peakHoursData,
    ] = await Promise.all([
      prisma.order.aggregate({
        where: { ...orderWhere, paymentStatus: "PAID" },
        _sum: { paidTotal: true },
      }),
      prisma.order.count({ where: orderWhere }),
      prisma.restaurantTable.count({
        where: {
          restaurantId,
          deletedAt: null,
          OR: [{ status: { not: "FREE" } }, { currentOrderId: { not: null } }],
        },
      }),
      prisma.payment.groupBy({
        by: ["method"],
        where: {
          restaurantId,
          status: "COMPLETED",
          createdAt: { gte: from, lte: to },
        },
        _sum: { amount: true },
      }),
      prisma.orderItem.groupBy({
        by: ["menuItemId", "nameSnapshot"],
        where: {
          order: orderWhere,
          menuItemId: { not: null },
        },
        _sum: { quantity: true, lineSubtotal: true },
        orderBy: { _sum: { quantity: "desc" } },
        take: 10,
      }),
      prisma.order.groupBy({
        by: ["type"],
        where: orderWhere,
        _count: { _all: true },
      }),
      prisma.$queryRawUnsafe<{ cnt: bigint }[]>(
        `SELECT COUNT(DISTINCT customer_id)::bigint AS cnt
         FROM orders
         WHERE restaurant_id = $1::uuid
           AND opened_at >= $2::timestamptz
           AND opened_at <= $3::timestamptz
           AND status <> 'CANCELLED'
           AND customer_id IS NOT NULL`,
        restaurantId,
        from,
        to,
      ),
      prisma.$queryRawUnsafe<{ name: string; revenue: unknown }[]>(categorySql, restaurantId, from, to),
      this.getPeakHours(restaurantId, from, to),
    ]);

    const revenue = paidAgg._sum.paidTotal ?? new Prisma.Decimal(0);
    const averageOrderValue =
      ordersCount > 0 ? (revenue.toNumber() / ordersCount).toFixed(2) : null;
    const distinctCustomers = Number(customerDistinct[0]?.cnt ?? 0);

    const peakHoursTop = [...peakHoursData.byHour]
      .filter((h) => h.ordersOpened > 0)
      .sort((a, b) => b.ordersOpened - a.ordersOpened)
      .slice(0, 5)
      .map((h) => ({
        hourLocal: h.hourLocal,
        ordersOpened: h.ordersOpened,
        revenue: h.revenue,
      }));

    return {
      range: { from: from.toISOString(), to: to.toISOString() },
      revenue: revenue.toFixed(2),
      ordersCount,
      activeTables,
      averageOrderValue,
      distinctCustomers,
      paymentMethods: paymentGroups.map((g) => ({
        method: g.method,
        total: (g._sum.amount ?? new Prisma.Decimal(0)).toFixed(2),
      })),
      topItems: topGroups.map((g) => ({
        menuItemId: g.menuItemId,
        name: g.nameSnapshot,
        quantity: g._sum.quantity ?? 0,
        revenue: (g._sum.lineSubtotal ?? new Prisma.Decimal(0)).toFixed(2),
      })),
      categoryMix: categoryRows.map((r) => ({
        name: r.name,
        revenue: d2s(new Prisma.Decimal(r.revenue as string | number)),
      })),
      orderTypes: typeGroups.map((g) => ({
        type: g.type,
        orders: g._count._all,
      })),
      peakHoursTop,
    };
  }

  async getDashboard(restaurantId: string, now: Date = new Date()): Promise<AnalyticsDashboardResponse> {
    const [{ startUtc, endUtc, timeZone }, currencyCode] = await Promise.all([
      businessDayBoundsUtc(restaurantId, now),
      getRestaurantCurrency(restaurantId),
    ]);
    const tzSql = escapeTzLiteral(timeZone);

    const paymentInBusinessDay = {
      restaurantId,
      status: "COMPLETED" as const,
      OR: [
        { processedAt: { gte: startUtc, lt: endUtc } },
        { AND: [{ processedAt: null }, { createdAt: { gte: startUtc, lt: endUtc } }] },
      ],
    };

    const [
      todayRevenue,
      ordersOpenedToday,
      ordersCompletedToday,
      activeTables,
      guestsRows,
      completedPayments,
      pendingPayments,
      openOrders,
      hourlyRows,
      recentOrdersRows,
      topItemsToday,
      completedOrderTotals,
    ] = await Promise.all([
      prisma.payment.aggregate({
        where: paymentInBusinessDay,
        _sum: { amount: true },
      }),
      prisma.order.count({
        where: {
          restaurantId,
          status: { not: "CANCELLED" },
          openedAt: { gte: startUtc, lt: endUtc },
        },
      }),
      prisma.order.count({
        where: {
          restaurantId,
          status: "COMPLETED",
          closedAt: { gte: startUtc, lt: endUtc },
        },
      }),
      prisma.restaurantTable.count({
        where: {
          restaurantId,
          deletedAt: null,
          OR: [{ status: { not: "FREE" } }, { currentOrderId: { not: null } }],
        },
      }),
      prisma.$queryRawUnsafe<{ guests: bigint }[]>(
        `SELECT COALESCE(SUM(
            CASE WHEN o.type = 'DINE_IN' THEN COALESCE(o.party_size, 1)::numeric ELSE 1::numeric END
          ), 0)::bigint AS guests
         FROM orders o
         WHERE o.restaurant_id = $1::uuid
           AND o.status = 'COMPLETED'
           AND o.closed_at IS NOT NULL
           AND o.closed_at >= $2::timestamptz
           AND o.closed_at < $3::timestamptz`,
        restaurantId,
        startUtc,
        endUtc,
      ),
      prisma.payment.count({
        where: paymentInBusinessDay,
      }),
      prisma.payment.count({
        where: { restaurantId, status: "PENDING" },
      }),
      prisma.order.count({
        where: {
          restaurantId,
          status: { notIn: ["COMPLETED", "CANCELLED"] },
        },
      }),
      prisma.$queryRawUnsafe<{ hour: number; revenue: unknown; orders_opened: bigint }[]>(
        `WITH rev AS (
          SELECT EXTRACT(HOUR FROM timezone('${tzSql}', COALESCE(p.processed_at, p.created_at)))::int AS hour,
                 SUM(p.amount) AS revenue
          FROM payments p
          WHERE p.restaurant_id = $1::uuid
            AND p.status = 'COMPLETED'
            AND COALESCE(p.processed_at, p.created_at) >= $2::timestamptz
            AND COALESCE(p.processed_at, p.created_at) < $3::timestamptz
          GROUP BY 1
        ),
        ord AS (
          SELECT EXTRACT(HOUR FROM timezone('${tzSql}', o.opened_at))::int AS hour,
                 COUNT(*)::bigint AS orders_opened
          FROM orders o
          WHERE o.restaurant_id = $1::uuid
            AND o.opened_at >= $2::timestamptz
            AND o.opened_at < $3::timestamptz
            AND o.status <> 'CANCELLED'
          GROUP BY 1
        )
        SELECT gs.h::int AS hour,
               COALESCE(rev.revenue, 0) AS revenue,
               COALESCE(ord.orders_opened, 0::bigint) AS orders_opened
        FROM generate_series(0, 23) AS gs(h)
        LEFT JOIN rev ON rev.hour = gs.h
        LEFT JOIN ord ON ord.hour = gs.h
        ORDER BY gs.h`,
        restaurantId,
        startUtc,
        endUtc,
      ),
      prisma.order.findMany({
        where: { restaurantId, status: { not: "CANCELLED" } },
        orderBy: { openedAt: "desc" },
        take: 8,
        select: {
          id: true,
          orderNumber: true,
          type: true,
          status: true,
          paymentStatus: true,
          total: true,
          openedAt: true,
          table: { select: { number: true } },
          waiter: { select: { fullName: true } },
        },
      }),
      prisma.orderItem.groupBy({
        by: ["menuItemId", "nameSnapshot"],
        where: {
          menuItemId: { not: null },
          order: {
            restaurantId,
            status: { not: "CANCELLED" },
            openedAt: { gte: startUtc, lt: endUtc },
          },
        },
        _sum: { quantity: true, lineSubtotal: true },
        orderBy: { _sum: { quantity: "desc" } },
        take: 8,
      }),
      prisma.order.aggregate({
        where: {
          restaurantId,
          status: "COMPLETED",
          closedAt: { gte: startUtc, lt: endUtc },
        },
        _sum: { total: true },
        _count: { _all: true },
      }),
    ]);

    const revDec = todayRevenue._sum.amount ?? new Prisma.Decimal(0);
    const completedOrdersToday = ordersCompletedToday;
    const completedSum = completedOrderTotals._sum.total ?? new Prisma.Decimal(0);
    const completedCnt = completedOrderTotals._count._all;
    const avgCompleted =
      completedCnt > 0 ? completedSum.div(completedCnt) : null;

    const guestsServed = Number(guestsRows[0]?.guests ?? 0);

    const hourlyToday = hourlyRows.map((r) => ({
      hourLocal: r.hour,
      revenue: d2s(new Prisma.Decimal(r.revenue as string | number)),
      ordersOpened: Number(r.orders_opened),
    }));

    let topRevH: number | null = null;
    let topRevAmt = new Prisma.Decimal(0);
    let topOrdH: number | null = null;
    let topOrdN = 0;
    for (const h of hourlyToday) {
      const rv = new Prisma.Decimal(h.revenue);
      if (topRevH === null || rv.gt(topRevAmt)) {
        topRevH = h.hourLocal;
        topRevAmt = rv;
      }
      if (topOrdH === null || h.ordersOpened > topOrdN) {
        topOrdH = h.hourLocal;
        topOrdN = h.ordersOpened;
      }
    }

    return {
      asOf: now.toISOString(),
      timeZone,
      currencyCode,
      today: {
        revenue: revDec.toFixed(2),
        ordersOpened: ordersOpenedToday,
        ordersCompleted: completedOrdersToday,
        activeTables,
        averageCompletedOrderValue: avgCompleted?.toFixed(2) ?? null,
        guestsServed,
        completedPayments,
        pendingPayments,
        openOrders,
      },
      peak: {
        topRevenueHourLocal: topRevAmt.gt(0) ? topRevH : null,
        topRevenueAmount: topRevAmt.toFixed(2),
        topOrdersHourLocal: topOrdN > 0 ? topOrdH : null,
        topOrdersOpened: topOrdN,
      },
      hourlyToday,
      recentOrders: recentOrdersRows.map((o) => ({
        id: o.id,
        orderNumber: o.orderNumber,
        type: o.type,
        status: o.status,
        paymentStatus: o.paymentStatus,
        total: o.total.toFixed(2),
        openedAt: o.openedAt.toISOString(),
        tableNumber: o.table?.number ?? null,
        waiterName: o.waiter?.fullName ?? null,
      })),
      topItems: topItemsToday.map((g) => ({
        menuItemId: g.menuItemId,
        name: g.nameSnapshot,
        quantity: g._sum.quantity ?? 0,
        revenue: (g._sum.lineSubtotal ?? new Prisma.Decimal(0)).toFixed(2),
      })),
    };
  }

  async getRevenueSeries(
    restaurantId: string,
    from: Date,
    to: Date,
    granularity: RevenueGranularity,
  ): Promise<AnalyticsRevenueResponse> {
    const [timeZone, currencyCode] = await Promise.all([
      getRestaurantTimeZone(restaurantId),
      getRestaurantCurrency(restaurantId),
    ]);
    const tzSql = escapeTzLiteral(timeZone);

    if (granularity === "hour") {
      const rows = await prisma.$queryRawUnsafe<{ bucket: Date; revenue: unknown; orders_opened: bigint }[]>(
        `WITH pay AS (
          SELECT date_trunc('hour', timezone('${tzSql}', COALESCE(p.processed_at, p.created_at))) AS bucket,
                 SUM(p.amount) AS revenue
          FROM payments p
          WHERE p.restaurant_id = $1::uuid
            AND p.status = 'COMPLETED'
            AND COALESCE(p.processed_at, p.created_at) >= $2::timestamptz
            AND COALESCE(p.processed_at, p.created_at) <= $3::timestamptz
          GROUP BY 1
        ),
        ord AS (
          SELECT date_trunc('hour', timezone('${tzSql}', o.opened_at)) AS bucket,
                 COUNT(*)::bigint AS orders_opened
          FROM orders o
          WHERE o.restaurant_id = $1::uuid
            AND o.opened_at >= $2::timestamptz
            AND o.opened_at <= $3::timestamptz
            AND o.status <> 'CANCELLED'
          GROUP BY 1
        )
        SELECT COALESCE(pay.bucket, ord.bucket) AS bucket,
               COALESCE(pay.revenue, 0) AS revenue,
               COALESCE(ord.orders_opened, 0::bigint) AS orders_opened
        FROM pay
        FULL OUTER JOIN ord ON pay.bucket = ord.bucket
        ORDER BY bucket`,
        restaurantId,
        from,
        to,
      );
      const points = rows
        .filter((r) => r.bucket)
        .map((r) => ({
          bucketStart: new Date(r.bucket).toISOString(),
          bucketLabel: new Date(r.bucket).toISOString(),
          revenue: d2s(new Prisma.Decimal(r.revenue as string | number)),
          ordersOpened: Number(r.orders_opened),
        }));
      return { timeZone, currencyCode, granularity, range: { from: from.toISOString(), to: to.toISOString() }, points };
    }

    const trunc = granularity === "day" ? "day" : "week";
    const rows = await prisma.$queryRawUnsafe<{ bucket: Date; revenue: unknown; orders_opened: bigint }[]>(
      `WITH pay AS (
        SELECT date_trunc('${trunc}', timezone('${tzSql}', COALESCE(p.processed_at, p.created_at))) AS bucket,
               SUM(p.amount) AS revenue
        FROM payments p
        WHERE p.restaurant_id = $1::uuid
          AND p.status = 'COMPLETED'
          AND COALESCE(p.processed_at, p.created_at) >= $2::timestamptz
          AND COALESCE(p.processed_at, p.created_at) <= $3::timestamptz
        GROUP BY 1
      ),
      ord AS (
        SELECT date_trunc('${trunc}', timezone('${tzSql}', o.opened_at)) AS bucket,
               COUNT(*)::bigint AS orders_opened
        FROM orders o
        WHERE o.restaurant_id = $1::uuid
          AND o.opened_at >= $2::timestamptz
          AND o.opened_at <= $3::timestamptz
          AND o.status <> 'CANCELLED'
        GROUP BY 1
      )
      SELECT COALESCE(pay.bucket, ord.bucket) AS bucket,
             COALESCE(pay.revenue, 0) AS revenue,
             COALESCE(ord.orders_opened, 0::bigint) AS orders_opened
      FROM pay
      FULL OUTER JOIN ord ON pay.bucket = ord.bucket
      ORDER BY bucket`,
      restaurantId,
      from,
      to,
    );

    const points = rows
      .filter((r) => r.bucket)
      .map((r) => ({
        bucketStart: new Date(r.bucket).toISOString(),
        bucketLabel: new Date(r.bucket).toISOString().slice(0, 10),
        revenue: d2s(new Prisma.Decimal(r.revenue as string | number)),
        ordersOpened: Number(r.orders_opened),
      }));

    return { timeZone, currencyCode, granularity, range: { from: from.toISOString(), to: to.toISOString() }, points };
  }

  async getTopItems(restaurantId: string, from: Date, to: Date, limit: number): Promise<AnalyticsTopItemsResponse> {
    const orderWhere = {
      restaurantId,
      openedAt: { gte: from, lte: to },
      status: { not: "CANCELLED" as const },
    };
    const topGroups = await prisma.orderItem.groupBy({
      by: ["menuItemId", "nameSnapshot"],
      where: {
        order: orderWhere,
        menuItemId: { not: null },
      },
      _sum: { quantity: true, lineSubtotal: true },
      orderBy: { _sum: { quantity: "desc" } },
      take: limit,
    });
    return {
      range: { from: from.toISOString(), to: to.toISOString() },
      items: topGroups.map((g) => ({
        menuItemId: g.menuItemId,
        name: g.nameSnapshot,
        quantity: g._sum.quantity ?? 0,
        revenue: (g._sum.lineSubtotal ?? new Prisma.Decimal(0)).toFixed(2),
      })),
    };
  }

  async getPayments(restaurantId: string, from: Date, to: Date): Promise<AnalyticsPaymentsResponse> {
    const currencyCode = await getRestaurantCurrency(restaurantId);
    const [byMethod, agg, refundAgg, pendingPayments, ordersUnpaid] = await Promise.all([
      prisma.payment.groupBy({
        by: ["method"],
        where: {
          restaurantId,
          status: "COMPLETED",
          OR: [
            { processedAt: { gte: from, lte: to } },
            { AND: [{ processedAt: null }, { createdAt: { gte: from, lte: to } }] },
          ],
        },
        _sum: { amount: true },
        _count: { _all: true },
      }),
      prisma.payment.aggregate({
        where: {
          restaurantId,
          status: "COMPLETED",
          OR: [
            { processedAt: { gte: from, lte: to } },
            { AND: [{ processedAt: null }, { createdAt: { gte: from, lte: to } }] },
          ],
        },
        _sum: { amount: true },
        _count: { _all: true },
        _avg: { amount: true },
      }),
      prisma.refund.aggregate({
        where: {
          order: { restaurantId },
          createdAt: { gte: from, lte: to },
        },
        _sum: { amount: true },
        _count: { _all: true },
      }),
      prisma.payment.count({ where: { restaurantId, status: "PENDING" } }),
      prisma.order.count({
        where: {
          restaurantId,
          paymentStatus: { in: ["UNPAID", "PARTIALLY_PAID"] },
          status: { notIn: ["COMPLETED", "CANCELLED"] },
        },
      }),
    ]);

    const total = agg._sum.amount ?? new Prisma.Decimal(0);
    const cnt = agg._count._all;
    const avg = cnt > 0 ? agg._avg.amount : null;

    return {
      range: { from: from.toISOString(), to: to.toISOString() },
      currencyCode,
      completed: {
        count: cnt,
        totalAmount: total.toFixed(2),
        averageAmount: avg != null ? new Prisma.Decimal(avg).toFixed(2) : null,
        byMethod: byMethod.map((g) => ({
          method: g.method,
          count: g._count._all,
          total: (g._sum.amount ?? new Prisma.Decimal(0)).toFixed(2),
        })),
      },
      refunds: {
        count: refundAgg._count._all,
        totalAmount: (refundAgg._sum.amount ?? new Prisma.Decimal(0)).toFixed(2),
      },
      pendingPipeline: {
        paymentsPending: pendingPayments,
        ordersUnpaidOrPartial: ordersUnpaid,
      },
    };
  }

  async getTables(restaurantId: string, from: Date, to: Date): Promise<AnalyticsTablesResponse> {
    const [occupiedTables, totalTables, durationRow, turnoverRow, busiest] = await Promise.all([
      prisma.restaurantTable.count({
        where: {
          restaurantId,
          deletedAt: null,
          OR: [{ status: { not: "FREE" } }, { currentOrderId: { not: null } }],
        },
      }),
      prisma.restaurantTable.count({ where: { restaurantId, deletedAt: null } }),
      prisma.$queryRawUnsafe<{ avg_minutes: unknown }[]>(
        `SELECT AVG(EXTRACT(EPOCH FROM (o.closed_at - o.opened_at)) / 60.0) AS avg_minutes
         FROM orders o
         WHERE o.restaurant_id = $1::uuid
           AND o.type = 'DINE_IN'
           AND o.status = 'COMPLETED'
           AND o.table_id IS NOT NULL
           AND o.closed_at IS NOT NULL
           AND o.closed_at >= $2::timestamptz
           AND o.closed_at <= $3::timestamptz`,
        restaurantId,
        from,
        to,
      ),
      prisma.$queryRawUnsafe<{ sessions: bigint; tables_used: bigint }[]>(
        `SELECT COUNT(*)::bigint AS sessions,
                COUNT(DISTINCT o.table_id)::bigint AS tables_used
         FROM orders o
         WHERE o.restaurant_id = $1::uuid
           AND o.type = 'DINE_IN'
           AND o.status = 'COMPLETED'
           AND o.table_id IS NOT NULL
           AND o.closed_at IS NOT NULL
           AND o.closed_at >= $2::timestamptz
           AND o.closed_at <= $3::timestamptz`,
        restaurantId,
        from,
        to,
      ),
      prisma.$queryRawUnsafe<
        { table_id: string; table_number: string; revenue: unknown; orders_count: bigint }[]
      >(
        `SELECT t.id AS table_id,
                t.number AS table_number,
                SUM(o.total) AS revenue,
                COUNT(*)::bigint AS orders_count
         FROM orders o
         JOIN restaurant_tables t ON t.id = o.table_id
         WHERE o.restaurant_id = $1::uuid
           AND o.type = 'DINE_IN'
           AND o.status = 'COMPLETED'
           AND o.closed_at IS NOT NULL
           AND o.closed_at >= $2::timestamptz
           AND o.closed_at <= $3::timestamptz
         GROUP BY t.id, t.number
         ORDER BY revenue DESC NULLS LAST
         LIMIT 5`,
        restaurantId,
        from,
        to,
      ),
    ]);

    const avgMin = durationRow[0]?.avg_minutes;
    const avgMinutes =
      avgMin != null && avgMin !== "" ? Number(avgMin) : null;
    const sessions = Number(turnoverRow[0]?.sessions ?? 0);
    const tablesUsed = Number(turnoverRow[0]?.tables_used ?? 0);
    const days = Math.max(1, (to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000));
    const turnoverPerTableDay =
      tablesUsed > 0 && sessions > 0 ? sessions / tablesUsed / days : sessions > 0 ? sessions / days : null;

    return {
      range: { from: from.toISOString(), to: to.toISOString() },
      live: { occupiedTables, totalTables },
      completedDineIn: {
        sessions,
        averageDurationMinutes: avgMinutes != null && Number.isFinite(avgMinutes) ? Math.round(avgMinutes * 10) / 10 : null,
        turnoverPerTableDay: turnoverPerTableDay != null ? Math.round(turnoverPerTableDay * 100) / 100 : null,
      },
      busiest: busiest.map((b) => ({
        tableId: b.table_id,
        tableNumber: b.table_number,
        revenue: d2s(new Prisma.Decimal(b.revenue as string | number)),
        ordersCount: Number(b.orders_count),
      })),
    };
  }

  async getPeakHours(restaurantId: string, from: Date, to: Date): Promise<AnalyticsPeakHoursResponse> {
    const timeZone = await getRestaurantTimeZone(restaurantId);
    const tzSql = escapeTzLiteral(timeZone);
    const rows = await prisma.$queryRawUnsafe<{ hour: number; revenue: unknown; orders_opened: bigint }[]>(
      `WITH rev AS (
        SELECT EXTRACT(HOUR FROM timezone('${tzSql}', COALESCE(p.processed_at, p.created_at)))::int AS hour,
               SUM(p.amount) AS revenue
        FROM payments p
        WHERE p.restaurant_id = $1::uuid
          AND p.status = 'COMPLETED'
          AND COALESCE(p.processed_at, p.created_at) >= $2::timestamptz
          AND COALESCE(p.processed_at, p.created_at) <= $3::timestamptz
        GROUP BY 1
      ),
      ord AS (
        SELECT EXTRACT(HOUR FROM timezone('${tzSql}', o.opened_at))::int AS hour,
               COUNT(*)::bigint AS orders_opened
        FROM orders o
        WHERE o.restaurant_id = $1::uuid
          AND o.opened_at >= $2::timestamptz
          AND o.opened_at <= $3::timestamptz
          AND o.status <> 'CANCELLED'
        GROUP BY 1
      )
      SELECT gs.h::int AS hour,
             COALESCE(rev.revenue, 0) AS revenue,
             COALESCE(ord.orders_opened, 0::bigint) AS orders_opened
      FROM generate_series(0, 23) AS gs(h)
      LEFT JOIN rev ON rev.hour = gs.h
      LEFT JOIN ord ON ord.hour = gs.h
      ORDER BY gs.h`,
      restaurantId,
      from,
      to,
    );

    const byHour = rows.map((r) => ({
      hourLocal: r.hour,
      revenue: d2s(new Prisma.Decimal(r.revenue as string | number)),
      ordersOpened: Number(r.orders_opened),
    }));

    let peakRevH: number | null = null;
    let peakRevAmt = new Prisma.Decimal(0);
    let peakOrdH: number | null = null;
    let peakOrdN = 0;
    for (const h of byHour) {
      const rv = new Prisma.Decimal(h.revenue);
      if (rv.gt(peakRevAmt)) {
        peakRevAmt = rv;
        peakRevH = h.hourLocal;
      }
      if (h.ordersOpened > peakOrdN) {
        peakOrdN = h.ordersOpened;
        peakOrdH = h.hourLocal;
      }
    }

    return {
      timeZone,
      range: { from: from.toISOString(), to: to.toISOString() },
      byHour,
      peakRevenueHourLocal: peakRevAmt.gt(0) ? peakRevH : null,
      peakOrdersHourLocal: peakOrdN > 0 ? peakOrdH : null,
    };
  }
}
