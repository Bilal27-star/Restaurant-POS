#!/usr/bin/env python3
"""End-of-day reconciliation: API/UI totals vs database ground truth."""

import json
import subprocess
import urllib.request
import urllib.error
from decimal import Decimal
from collections import defaultdict

API = "http://localhost:4000/api/v1"
PG = ["psql", "-h", "127.0.0.1", "-p", "55432", "-U", "postgres", "-d", "postgres", "-t", "-A", "-F", "|"]


def d(x):
    if x is None or x == "":
        return Decimal("0")
    return Decimal(str(x).strip())


def psql(sql):
    env = {"PGPASSWORD": "postgres"}
    r = subprocess.run(PG + ["-c", sql], capture_output=True, text=True, env={**subprocess.os.environ, **env})
    if r.returncode != 0:
        raise RuntimeError(r.stderr or r.stdout)
    lines = [ln for ln in r.stdout.strip().split("\n") if ln.strip()]
    return lines


def api(method, path, token=None, body=None):
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(f"{API}{path}", data=data, headers=headers, method=method)
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read())


def login():
    out = api("POST", "/auth/login", body={"username": "admin", "password": "admin", "restaurantSlug": "default"})
    return out["data"]["accessToken"], out["data"]["restaurant"]["id"]


def ui_metrics_from_txs(opening_float, cash_txs, payments_by_id):
    """Mirror computeShiftDrawerMetrics + hydrateFromApi mapping."""
    cash_sales = card_sales = takeaway = refunds = expenses = Decimal("0")
    for t in cash_txs:
        typ = t["type"]
        amt = d(t["amount"])
        if typ == "SALE_CASH":
            cash_sales += amt
        elif typ == "SALE_CARD":
            card_sales += amt
        elif typ == "TAKEAWAY_CASH":
            takeaway += amt
        elif typ == "SALE_IN":
            # Current hydrateFromApi default: all SALE_IN → sale_cash
            cash_sales += amt
        elif typ == "REFUND_OUT":
            refunds += -amt
        elif typ == "EXPENSE_OUT":
            expenses += -amt
    total_sales = cash_sales + card_sales + takeaway
    net_cash = cash_sales + takeaway - refunds - expenses
    expected_drawer = d(opening_float) + net_cash
    return {
        "cashSalesDa": cash_sales,
        "cardSalesDa": card_sales,
        "takeawayRevenueDa": takeaway,
        "refundsDa": refunds,
        "expensesDa": expenses,
        "totalSalesDa": total_sales,
        "netCashMovementDa": net_cash,
        "expectedDrawerCashDa": expected_drawer,
    }


def main():
    mismatches = []
    notes = []

    token, restaurant_id = login()

    # Restaurant timezone + business day bounds via API dashboard (uses same logic)
    dash = api("GET", "/analytics/dashboard", token=token)["data"]

    # Current shift from API
    shift_resp = api("GET", "/shifts/current", token=token)["data"]
    shift = shift_resp.get("shift")
    cash_txs_api = shift_resp.get("cashTransactions") or []

    if not shift:
        print("NO OPEN SHIFT — auditing business-day totals only")
        shift_id = None
    else:
        shift_id = shift["id"]
        print(f"Open shift: {shift_id} opened {shift['openedAt']}")

    # Business day bounds from DB (match analytics)
    bounds_line = psql(
        f"""SELECT start_utc, end_utc, timezone FROM (
          SELECT
            (date_trunc('day', now() AT TIME ZONE r.timezone) AT TIME ZONE r.timezone) AS start_utc,
            ((date_trunc('day', now() AT TIME ZONE r.timezone) + interval '1 day') AT TIME ZONE r.timezone) AS end_utc,
            r.timezone
          FROM restaurants r WHERE r.id = '{restaurant_id}'::uuid
        ) x"""
    )[0]
    start_utc, end_utc, tz = bounds_line.split("|")
    print(f"Business day [{tz}): {start_utc} → {end_utc}")

    def check(name, expected, actual, tol=Decimal("0.01")):
        exp, act = d(expected), d(actual)
        ok = abs(exp - act) <= tol
        if not ok:
            mismatches.append({"check": name, "expected_db": str(exp), "actual": str(act), "delta": str(act - exp)})
        return ok, exp, act

    sections = {}

    # --- ORDERS (business day) ---
    order_sql = f"""
    SELECT
      COUNT(*) FILTER (WHERE status <> 'CANCELLED') AS orders_opened,
      COUNT(*) FILTER (WHERE status = 'COMPLETED' AND closed_at >= '{start_utc}'::timestamptz AND closed_at < '{end_utc}'::timestamptz) AS completed_today,
      COUNT(*) FILTER (WHERE status = 'CANCELLED' AND opened_at >= '{start_utc}'::timestamptz AND opened_at < '{end_utc}'::timestamptz) AS cancelled_today,
      COALESCE(SUM(discount_total) FILTER (WHERE status <> 'CANCELLED' AND opened_at >= '{start_utc}'::timestamptz AND opened_at < '{end_utc}'::timestamptz), 0) AS discounts_today,
      COALESCE(SUM(total) FILTER (WHERE status = 'COMPLETED' AND closed_at >= '{start_utc}'::timestamptz AND closed_at < '{end_utc}'::timestamptz), 0) AS completed_order_totals,
      COALESCE(SUM(paid_total) FILTER (WHERE status = 'COMPLETED' AND closed_at >= '{start_utc}'::timestamptz AND closed_at < '{end_utc}'::timestamptz), 0) AS completed_paid_totals,
      COALESCE(SUM(total) FILTER (WHERE type = 'DINE_IN' AND status = 'COMPLETED' AND closed_at >= '{start_utc}'::timestamptz AND closed_at < '{end_utc}'::timestamptz), 0) AS dine_in_completed,
      COALESCE(SUM(total) FILTER (WHERE type = 'TAKEAWAY' AND status = 'COMPLETED' AND closed_at >= '{start_utc}'::timestamptz AND closed_at < '{end_utc}'::timestamptz), 0) AS takeaway_completed
    FROM orders WHERE restaurant_id = '{restaurant_id}'::uuid
    """
    o = psql(order_sql)[0].split("|")
    sections["orders"] = {
        "opened_today": o[0],
        "completed_today": o[1],
        "cancelled_today": o[2],
        "discounts_today": o[3],
        "completed_order_totals": o[4],
        "completed_paid_totals": o[5],
        "dine_in_completed": o[6],
        "takeaway_completed": o[7],
    }

    # --- PAYMENTS (business day) ---
    pay_sql = f"""
    SELECT
      COALESCE(SUM(amount), 0) AS gross_payments,
      COALESCE(SUM(amount) FILTER (WHERE method = 'CASH'), 0) AS cash_payments,
      COALESCE(SUM(amount) FILTER (WHERE method = 'CARD'), 0) AS card_payments,
      COUNT(*) AS payment_count
    FROM payments
    WHERE restaurant_id = '{restaurant_id}'::uuid AND status = 'COMPLETED'
      AND COALESCE(processed_at, created_at) >= '{start_utc}'::timestamptz
      AND COALESCE(processed_at, created_at) < '{end_utc}'::timestamptz
    """
    p = psql(pay_sql)[0].split("|")
    sections["payments_today"] = {
        "gross": p[0], "cash": p[1], "card": p[2], "count": p[3]
    }

    # --- REFUNDS ---
    ref_sql = f"""
    SELECT COALESCE(SUM(r.amount), 0), COUNT(*)
    FROM refunds r JOIN orders o ON o.id = r.order_id
    WHERE o.restaurant_id = '{restaurant_id}'::uuid
      AND r.created_at >= '{start_utc}'::timestamptz AND r.created_at < '{end_utc}'::timestamptz
    """
    r = psql(ref_sql)[0].split("|")
    sections["refunds_today"] = {"total": r[0], "count": r[1]}

    # --- SHIFT denormalized totals vs payments in shift ---
    if shift_id:
        sh = psql(f"""
          SELECT opening_cash_float, gross_sales, cash_sales_total, card_sales_total, transfer_sales_total, refunds_total
          FROM shifts WHERE id = '{shift_id}'::uuid
        """)[0].split("|")
        sections["shift_denorm"] = {
            "opening_float": sh[0], "gross_sales": sh[1], "cash_sales": sh[2],
            "card_sales": sh[3], "transfer_sales": sh[4], "refunds_total": sh[5],
        }

        shift_pay = psql(f"""
          SELECT COALESCE(SUM(amount),0), COALESCE(SUM(amount) FILTER (WHERE method='CASH'),0),
                 COALESCE(SUM(amount) FILTER (WHERE method='CARD'),0), COUNT(*)
          FROM payments WHERE shift_id = '{shift_id}'::uuid AND status='COMPLETED'
        """)[0].split("|")
        sections["shift_payments_recomputed"] = {
            "gross": shift_pay[0], "cash": shift_pay[1], "card": shift_pay[2], "count": shift_pay[3]
        }

        shift_ref = psql(f"""
          SELECT COALESCE(SUM(r.amount),0), COUNT(*)
          FROM refunds r JOIN payments p ON p.id = r.payment_id
          WHERE p.shift_id = '{shift_id}'::uuid
        """)[0].split("|")
        sections["shift_refunds_recomputed"] = {"total": shift_ref[0], "count": shift_ref[1]}

        # Cash transactions ledger
        ct_lines = psql(f"""
          SELECT type, COALESCE(SUM(amount),0), COUNT(*)
          FROM cash_transactions WHERE shift_id = '{shift_id}'::uuid
          GROUP BY type ORDER BY type
        """)
        ct_by_type = {}
        for ln in ct_lines:
            typ, total, cnt = ln.split("|")
            ct_by_type[typ] = {"total": total, "count": cnt}
        sections["cash_transactions_by_type"] = ct_by_type

        sale_in_total = d(ct_by_type.get("SALE_IN", {}).get("total", "0"))
        expense_out = -d(ct_by_type.get("EXPENSE_OUT", {}).get("total", "0"))
        refund_out = -d(ct_by_type.get("REFUND_OUT", {}).get("total", "0"))
        expected_drawer_db = d(sh[0]) + sale_in_total - expense_out - refund_out
        sections["drawer_balance_db"] = {
            "opening": sh[0],
            "sale_in": str(sale_in_total),
            "expenses_out": str(expense_out),
            "refunds_out": str(refund_out),
            "expected_cash": str(expected_drawer_db),
        }

        # Payment-linked cash txs must match payment amounts
        orphan = psql(f"""
          SELECT COUNT(*) FROM payments p
          WHERE p.shift_id = '{shift_id}'::uuid AND p.status='COMPLETED'
            AND NOT EXISTS (SELECT 1 FROM cash_transactions c WHERE c.payment_id = p.id AND c.type='SALE_IN')
        """)[0]
        dup = psql(f"""
          SELECT COUNT(*) FROM (
            SELECT payment_id FROM cash_transactions
            WHERE shift_id='{shift_id}'::uuid AND payment_id IS NOT NULL
            GROUP BY payment_id HAVING COUNT(*) > 1
          ) x
        """)[0]
        sections["cash_tx_integrity"] = {"payments_missing_sale_in": orphan, "duplicate_payment_txs": dup}

        # UI metrics simulation
        ct_rows = []
        for ln in psql(f"SELECT type, amount, payment_id FROM cash_transactions WHERE shift_id='{shift_id}'::uuid"):
            typ, amt, pid = ln.split("|")
            ct_rows.append({"type": typ, "amount": amt, "paymentId": pid or None})
        ui = ui_metrics_from_txs(sh[0], ct_rows, {})
        sections["ui_metrics_simulated"] = {k: str(v) for k, v in ui.items()}

        # Dine-in / takeaway from payments joined to orders (shift)
        dt = psql(f"""
          SELECT o.type, COALESCE(SUM(p.amount),0), COUNT(*)
          FROM payments p JOIN orders o ON o.id = p.order_id
          WHERE p.shift_id = '{shift_id}'::uuid AND p.status='COMPLETED'
          GROUP BY o.type
        """)
        by_type = {}
        for ln in dt:
            typ, total, cnt = ln.split("|")
            by_type[typ] = {"total": total, "count": cnt}
        sections["shift_sales_by_order_type"] = by_type

    # Analytics API comparisons
    payments_api = api("GET", f"/analytics/payments?from={start_utc}&to={end_utc}", token=token)["data"]

    check("dashboard.todayRevenue vs payments_today.gross",
          sections["payments_today"]["gross"], dash.get("todayRevenue", "0"))
    check("analytics.payments.completed.total vs DB gross",
          sections["payments_today"]["gross"], payments_api["completed"]["totalAmount"])
    check("analytics.payments.refunds vs DB refunds",
          sections["refunds_today"]["total"], payments_api["refunds"]["totalAmount"])
    check("dashboard.ordersOpenedToday vs DB",
          sections["orders"]["opened_today"], dash.get("ordersOpenedToday", 0))
    check("dashboard.ordersCompletedToday vs DB",
          sections["orders"]["completed_today"], dash.get("ordersCompletedToday", 0))

    if shift_id:
        sd = sections["shift_denorm"]
        sp = sections["shift_payments_recomputed"]
        check("shift.gross_sales vs sum(payments in shift)", sp["gross"], sd["gross_sales"])
        check("shift.cash_sales_total vs cash payments", sp["cash"], sd["cash_sales"])
        check("shift.card_sales_total vs card payments", sp["card"], sd["card_sales"])
        check("shift.refunds_total vs refunds in shift", sections["shift_refunds_recomputed"]["total"], sd["refunds_total"])

        ui = sections["ui_metrics_simulated"]
        check("UI totalSales vs shift.gross_sales (BUG if mismatch)", sd["gross_sales"], ui["totalSalesDa"])
        check("UI cashSales vs shift.cash_sales (BUG if mismatch)", sd["cash_sales"], ui["cashSalesDa"])
        check("UI cardSales vs shift.card_sales (BUG if mismatch)", sd["card_sales"], ui["cardSalesDa"])
        check("UI expectedDrawer vs DB ledger", sections["drawer_balance_db"]["expected_cash"], ui["expectedDrawerCashDa"])

        net_paid_vs_gross = d(sp["gross"]) - d(sections["shift_refunds_recomputed"]["total"])
        check("shift gross - refunds ≈ net revenue", net_paid_vs_gross, d(sd["gross_sales"]) - d(sd["refunds_total"]))

        if sections["cash_tx_integrity"]["payments_missing_sale_in"] != "0":
            mismatches.append({"check": "payments_missing_cash_tx", "count": sections["cash_tx_integrity"]["payments_missing_sale_in"]})
        if sections["cash_tx_integrity"]["duplicate_payment_txs"] != "0":
            mismatches.append({"check": "duplicate_cash_tx_per_payment", "count": sections["cash_tx_integrity"]["duplicate_payment_txs"]})

        # Takeaway double-count risk: UI takeaway bucket vs DB
        ui_takeaway = d(ui["takeawayRevenueDa"])
        db_takeaway = d(sections["shift_sales_by_order_type"].get("TAKEAWAY", {}).get("total", "0"))
        if ui_takeaway != db_takeaway:
            notes.append(f"UI takeaway bucket ({ui_takeaway}) != TAKEAWAY payments ({db_takeaway}) — SALE_IN mapped to cash in UI")

    # Order totals integrity: completed paid should match payments - refunds per order
    order_integrity = psql(f"""
      SELECT COUNT(*) FROM orders o
      WHERE o.restaurant_id = '{restaurant_id}'::uuid AND o.status = 'COMPLETED'
        AND o.closed_at >= '{start_utc}'::timestamptz AND o.closed_at < '{end_utc}'::timestamptz
        AND ABS(o.paid_total - COALESCE((
          SELECT SUM(p.amount) FROM payments p WHERE p.order_id=o.id AND p.status='COMPLETED'
        ),0) + COALESCE((
          SELECT SUM(r.amount) FROM refunds r WHERE r.order_id=o.id
        ),0)) > 0.01
    """)[0]
    if order_integrity != "0":
        mismatches.append({"check": "order_paid_total_mismatch", "count": order_integrity})

    # Discount sanity: any order with discount > 0 today
    disc_orders = psql(f"""
      SELECT COUNT(*), COALESCE(SUM(discount_total),0)
      FROM orders WHERE restaurant_id='{restaurant_id}'::uuid AND discount_total > 0
        AND opened_at >= '{start_utc}'::timestamptz AND opened_at < '{end_utc}'::timestamptz
    """)[0].split("|")
    sections["discounts_detail"] = {"orders_with_discount": disc_orders[0], "sum": disc_orders[1]}

    # Cancelled orders detail
    cancelled_detail = psql(f"""
      SELECT COUNT(*), COALESCE(SUM(total),0)
      FROM orders WHERE restaurant_id='{restaurant_id}'::uuid AND status='CANCELLED'
        AND opened_at >= '{start_utc}'::timestamptz AND opened_at < '{end_utc}'::timestamptz
    """)[0].split("|")
    sections["cancelled_detail"] = {"count": cancelled_detail[0], "sum_totals_not_revenue": cancelled_detail[1]}

    report = {
        "verdict": "READY" if not mismatches else "NOT READY",
        "mismatch_count": len(mismatches),
        "mismatches": mismatches,
        "notes": notes,
        "sections": sections,
        "dashboard_api": {
            "todayRevenue": dash.get("todayRevenue"),
            "ordersOpenedToday": dash.get("ordersOpenedToday"),
            "ordersCompletedToday": dash.get("ordersCompletedToday"),
        },
        "analytics_payments_api": payments_api,
    }
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
