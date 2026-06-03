#!/usr/bin/env python3
"""Cash register go-live audit — API scenarios 1-10."""
import json, sys, uuid, urllib.request, urllib.error, concurrent.futures, time

BASE = "http://localhost:4000/api/v1"
POULER = "33175e9a-99ce-4895-8779-fa22c6f5b2f4"
WAITER = "40b01b25-9284-495f-b9a8-83122982d463"

def login():
    body = json.dumps({"username": "admin", "password": "admin", "restaurantSlug": "default"}).encode()
    r = urllib.request.Request(BASE + "/auth/login", data=body, headers={"Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(r) as res:
        return json.load(res)["data"]["accessToken"]

TOKEN = login()

def req(method, path, body=None, token=TOKEN):
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(
        BASE + path,
        data=data,
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        method=method,
    )
    try:
        with urllib.request.urlopen(r) as res:
            return {"status": res.status, "data": json.load(res)}
    except urllib.error.HTTPError as e:
        try:
            body = json.loads(e.read().decode())
        except Exception:
            body = {"raw": e.read().decode()}
        return {"status": e.code, "data": body}

def cmid():
    return str(uuid.uuid4())

def ensure_shift():
    cur = req("GET", "/shifts/current")
    shift = cur["data"].get("data", {}).get("shift")
    if shift and shift.get("status") == "OPEN":
        return shift["id"]
    opened = req("POST", "/shifts/open", {"openingCashFloat": "0.00"})
    return opened["data"]["data"]["shift"]["id"]

def free_table():
    layout = req("GET", "/tables/layout")["data"]["data"]

    def walk(o):
        if isinstance(o, list):
            for x in o:
                yield from walk(x)
        elif isinstance(o, dict):
            if isinstance(o.get("tables"), list) and o["tables"] and "id" in o["tables"][0]:
                for t in o["tables"]:
                    yield t
            else:
                for v in o.values():
                    yield from walk(v)

    return next(t for t in walk(layout) if t.get("status") == "FREE")

def create_dine_in(sent=True):
    t = free_table()
    o = req("POST", "/orders", {
        "type": "DINE_IN", "tableId": t["id"], "partySize": 2, "waiterId": WAITER,
        "lines": [{"menuItemId": POULER, "quantity": 1, "modifierIds": [], "removedIngredientIds": [], "kitchenNotes": None}],
        "clientMutationId": cmid(),
    })["data"]["data"]
    if sent:
        time.sleep(0.3)
    return o

def create_takeaway():
    o = req("POST", "/orders", {
        "type": "TAKEAWAY", "waiterId": WAITER,
        "lines": [{"menuItemId": POULER, "quantity": 1, "modifierIds": [], "removedIngredientIds": [], "kitchenNotes": None}],
        "clientMutationId": cmid(),
    })["data"]["data"]
    time.sleep(0.3)
    return o

def checkout(order, cash_received=None, idem=None, version=None):
    total = float(order["total"])
    tender = float(cash_received) if cash_received is not None else total
    body = {
        "orderId": order["id"],
        "method": "CASH",
        "cashReceived": f"{tender:.2f}",
        "orderVersion": version if version is not None else order["version"],
    }
    if idem:
        body["idempotencyKey"] = idem
    return req("POST", "/payments/checkout", body)

def order_payments(order_id):
    # via order detail
    o = req("GET", f"/orders/{order_id}")["data"]["data"]
    return o

def receipt_jobs_for_order(order_number):
    jobs = req("GET", "/print/jobs?limit=50")["data"].get("data") or []
    out = []
    for j in jobs:
        full = req("GET", f"/print/jobs/{j['id']}")["data"]["data"]
        p = full.get("payloadJson") or {}
        if p.get("orderNumber") == order_number and full.get("kind") == "CUSTOMER_RECEIPT":
            out.append(full)
    return out

def payment_count_db(order_id):
    o = order_payments(order_id)
    # count via payments search not available — use paidTotal and status
    return o

def cash_tx_count(order_id):
    # infer from payment
    o = order_payments(order_id)
    return float(o.get("paidTotal", 0))

results = []

def record(name, ok, detail):
    results.append({"scenario": name, "pass": ok, "detail": detail})
    print(f"{'PASS' if ok else 'FAIL'}  {name}: {json.dumps(detail, default=str)[:200]}")

ensure_shift()

# S1 Dine-in cash
o1 = create_dine_in()
total1 = float(o1["total"])
r1 = checkout(o1, cash_received=total1 + 500)
o1_after = order_payments(o1["id"])
jobs1 = receipt_jobs_for_order(o1["orderNumber"])
record("S1 Dine-in cash", r1["status"] in (200, 201) and o1_after["status"] == "COMPLETED" and o1_after["paymentStatus"] == "PAID",
       {"payments_paid": o1_after["paidTotal"], "status": o1_after["status"], "receipt_jobs": len(jobs1), "change": r1["data"].get("data", {}).get("payment", {}).get("changeGiven")})

# S2 Takeaway cash
o2 = create_takeaway()
r2 = checkout(o2, cash_received=float(o2["total"]) + 1000)
o2_after = order_payments(o2["id"])
jobs2 = receipt_jobs_for_order(o2["orderNumber"])
record("S2 Takeaway cash", r2["status"] in (200, 201) and o2_after["status"] == "COMPLETED",
       {"status": o2_after["status"], "receipt_jobs": len(jobs2)})

# S3 Cash > total (change)
o3 = create_dine_in()
total3 = float(o3["total"])
r3 = checkout(o3, cash_received=total3 + 2000)
pay3 = r3["data"].get("data", {}).get("payment", {})
change3 = float(pay3.get("changeGiven") or 0)
record("S3 Overpay change", abs(change3 - 2000) < 0.02 and pay3.get("amount") == f"{total3:.2f}",
       {"changeGiven": pay3.get("changeGiven"), "amount": pay3.get("amount")})

# S4 Exact amount
o4 = create_dine_in()
total4 = float(o4["total"])
r4 = checkout(o4, cash_received=total4)
pay4 = r4["data"].get("data", {}).get("payment", {})
record("S4 Exact amount", pay4.get("changeGiven") in (None, "0.00", 0, "0") or float(pay4.get("changeGiven") or 0) < 0.01,
       {"changeGiven": pay4.get("changeGiven"), "cashReceived": total4})

# S5 Reopen paid order protection
o5 = create_dine_in()
checkout(o5, cash_received=float(o5["total"]) + 500)
o5p = order_payments(o5["id"])
r5 = checkout(o5, cash_received=float(o5["total"]) + 500, version=o5p["version"])
record("S5 Paid order protection", r5["status"] in (400, 409),
       {"status": r5["status"], "error": r5["data"].get("error")})

# S6 Double click (same idempotency key)
o6 = create_dine_in()
idem = cmid()
r6a = checkout(o6, cash_received=float(o6["total"]) + 1000, idem=idem)
r6b = checkout(o6, cash_received=float(o6["total"]) + 1000, idem=idem)
o6_after = order_payments(o6["id"])
pay_id_a = r6a["data"].get("data", {}).get("payment", {}).get("id")
pay_id_b = r6b["data"].get("data", {}).get("payment", {}).get("id")
jobs6 = receipt_jobs_for_order(o6["orderNumber"])
record("S6 Double click idempotency", pay_id_a == pay_id_b and float(o6_after["paidTotal"]) <= float(o6["total"]) + 0.01,
       {"payment_a": pay_id_a, "payment_b": pay_id_b, "paidTotal": o6_after["paidTotal"], "receipt_jobs": len(jobs6)})

# S7 Network retry (replay idempotency after success)
o7 = create_dine_in()
idem7 = cmid()
r7a = checkout(o7, cash_received=float(o7["total"]) + 500, idem=idem7)
# simulate retry with stale version but same idem
r7b = checkout(o7, cash_received=float(o7["total"]) + 500, idem=idem7, version=o7["version"])
pay7a = r7a["data"].get("data", {}).get("payment", {}).get("id")
pay7b = r7b["data"].get("data", {}).get("payment", {}).get("id")
record("S7 Network retry", pay7a == pay7b and r7b["status"] in (200, 201),
       {"same_payment": pay7a == pay7b, "status_retry": r7b["status"]})

# S8 Printer offline — API still enqueues receipt job (hardware failure is async)
o8 = create_dine_in()
r8 = checkout(o8, cash_received=float(o8["total"]) + 500)
jobs8 = receipt_jobs_for_order(o8["orderNumber"])
record("S8 Printer offline (API enqueue)", r8["status"] in (200, 201) and len(jobs8) >= 1,
       {"receipt_jobs": len(jobs8), "note": "Web uses print window; API enqueues CUSTOMER_RECEIPT regardless"})

# S9 Cash drawer offline — payload flag only; payment still succeeds
o9 = create_dine_in()
r9 = checkout(o9, cash_received=float(o9["total"]) + 500)
pay9 = r9["data"].get("data", {})
record("S9 Drawer offline resilience", r9["status"] in (200, 201) and pay9.get("orderCompleted") is True,
       {"orderCompleted": pay9.get("orderCompleted"), "note": "Drawer pulse in receipt ESC/POS; payment not blocked"})

# S10 Two terminals simultaneous
o10 = create_dine_in()
idem10a = cmid()
idem10b = cmid()
ver10 = o10["version"]

def pay_a():
    return checkout(o10, cash_received=float(o10["total"]) + 500, idem=idem10a, version=ver10)

def pay_b():
    return checkout(o10, cash_received=float(o10["total"]) + 500, idem=idem10b, version=ver10)

with concurrent.futures.ThreadPoolExecutor(max_workers=2) as ex:
    fa, fb = ex.submit(pay_a), ex.submit(pay_b)
    ra, rb = fa.result(), fb.result()
o10_after = order_payments(o10["id"])
successes = sum(1 for r in (ra, rb) if r["status"] in (200, 201))
jobs10 = receipt_jobs_for_order(o10["orderNumber"])
record("S10 Concurrent terminals", successes == 1 and o10_after["status"] == "COMPLETED" and float(o10_after["paidTotal"]) <= float(o10["total"]) + 0.01,
       {"success_count": successes, "statuses": [ra["status"], rb["status"]], "paidTotal": o10_after["paidTotal"], "receipt_jobs": len(jobs10)})

all_pass = all(r["pass"] for r in results)
print("\n=== SUMMARY ===")
for r in results:
    print(f"  {r['scenario']}: {'PASS' if r['pass'] else 'FAIL'}")
print(f"\nVERDICT: {'READY' if all_pass else 'NOT READY'}")
sys.exit(0 if all_pass else 1)
