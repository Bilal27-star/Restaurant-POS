#!/usr/bin/env python3
"""Go-live kitchen reliability test suite."""
import json, sys, uuid, urllib.request, urllib.error

BASE = "http://localhost:4000/api/v1"
POULER = "33175e9a-99ce-4895-8779-fa22c6f5b2f4"
VIANDE = "66db3f5e-2673-4306-a75d-c526d0297481"
WAITER = "40b01b25-9284-495f-b9a8-83122982d463"

def login():
    body = json.dumps({"username": "admin", "password": "admin", "restaurantSlug": "default"}).encode()
    r = urllib.request.Request(BASE + "/auth/login", data=body, headers={"Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(r) as res:
        return json.load(res)["data"]["accessToken"]

TOKEN = login()

def req(method, path, body=None):
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(
        BASE + path,
        data=data,
        headers={"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json"},
        method=method,
    )
    try:
        with urllib.request.urlopen(r) as res:
            return json.load(res)
    except urllib.error.HTTPError as e:
        return {"error": e.code, "body": json.loads(e.read().decode())}

def cmid():
    return str(uuid.uuid4())

def free_table():
    layout = req("GET", "/tables/layout")["data"]
    def walk(o):
        if isinstance(o, list):
            for x in o: yield from walk(x)
        elif isinstance(o, dict):
            if isinstance(o.get("tables"), list) and o["tables"] and "id" in o["tables"][0]:
                for t in o["tables"]: yield t
            else:
                for v in o.values(): yield from walk(v)
    return next(t for t in walk(layout) if t.get("status") == "FREE")

def jobs_for_order(order_number, since_count=0):
    jobs = req("GET", "/print/jobs?limit=50")["data"]
    out = []
    for j in jobs:
        full = req("GET", f"/print/jobs/{j['id']}")["data"]
        p = full.get("payloadJson") or {}
        if p.get("orderNumber") == order_number:
            out.append(full)
    return out

def summarize_job(full):
    p = full.get("payloadJson") or {}
    items = []
    for s in p.get("sections") or []:
        for ln in s.get("lines") or []:
            items.append({"section": s.get("kind"), "name": ln.get("name"), "qty": ln.get("qty"), "deltaQty": ln.get("deltaQty")})
    if not items:
        for ln in p.get("lines") or []:
            items.append({"section": "LEGACY", "name": ln.get("name"), "qty": ln.get("qty")})
    return {
        "id": full["id"][:8],
        "ticketMode": p.get("ticketMode"),
        "payloadVersion": p.get("payloadVersion"),
        "items": items,
    }

def audit_for(order_id):
    return req("GET", f"/orders/{order_id}/kitchen/dispatch-audit")["data"]

def count_jobs_before():
    return len(req("GET", "/print/jobs?limit=100")["data"])

def run_blocker_a():
    print("\n=== BLOCKER A: Meta patches must not print ===")
    t = free_table()
    o = req("POST", "/orders", {
        "type": "DINE_IN", "tableId": t["id"], "partySize": 2, "waiterId": WAITER,
        "lines": [{"menuItemId": POULER, "quantity": 1, "modifierIds": [], "removedIngredientIds": [], "kitchenNotes": None}],
        "clientMutationId": cmid(),
    })["data"]
    oid, ver, on = o["id"], o["version"], o["orderNumber"]
    import time; time.sleep(0.5)
    before_jobs = count_jobs_before()
    # waiter
    req("PATCH", f"/orders/{oid}", {"waiterName": "Test Waiter", "version": ver})
    ver += 1
    # customer notes
    req("PATCH", f"/orders/{oid}", {"customerNotes": "VIP table", "version": ver})
    ver += 1
    # party size
    req("PATCH", f"/orders/{oid}", {"partySize": 4, "version": ver})
    after_jobs = count_jobs_before()
    jobs = jobs_for_order(on)
    legacy = [j for j in jobs if (j.get("payloadJson") or {}).get("payloadVersion") is None]
    audit = audit_for(oid)
    meta_jobs_added = after_jobs - before_jobs
    ok = meta_jobs_added == 0 and len(legacy) == 0
    print(f"  waiter+notes+partySize: new_jobs={meta_jobs_added} legacy={len(legacy)} audit={len(audit)} PASS={ok}")
    return ok

def run_food_scenarios():
    print("\n=== BLOCKER B/D: Food mutation coverage ===")
    results = []
    t = free_table()
    o = req("POST", "/orders", {
        "type": "DINE_IN", "tableId": t["id"], "partySize": 2, "waiterId": WAITER,
        "lines": [
            {"menuItemId": POULER, "quantity": 1, "modifierIds": [], "removedIngredientIds": [], "kitchenNotes": None},
            {"menuItemId": VIANDE, "quantity": 1, "modifierIds": [], "removedIngredientIds": [], "kitchenNotes": None},
        ],
        "clientMutationId": cmid(),
    })["data"]
    oid, ver, on = o["id"], o["version"], o["orderNumber"]
    import time; time.sleep(0.5)
    jobs = jobs_for_order(on)
    r1 = len(jobs) == 1 and jobs[0]["payloadJson"].get("payloadVersion") == 2
    results.append(("CREATE", r1, summarize_job(jobs[0]) if jobs else None))

    # ADD
    o2 = req("POST", f"/orders/{oid}/lines", {
        "lines": [{"menuItemId": POULER, "quantity": 1, "modifierIds": [], "removedIngredientIds": [], "kitchenNotes": None}],
        "clientMutationId": cmid(), "version": ver,
    })["data"]
    ver = o2["version"]
    jobs = jobs_for_order(on)
    add_jobs = [j for j in jobs if j["payloadJson"].get("ticketMode") == "NEW" and len(j["payloadJson"].get("sections", [{}])[0].get("lines", [])) == 1]
    r2 = len(add_jobs) >= 1
    results.append(("ADD", r2, summarize_job(add_jobs[-1]) if add_jobs else None))

    pouler = next(i for i in o2["items"] if i["nameSnapshot"] == "Pouler" and i["quantity"] == 1)
    # QTY without cmid (server auto-dispatch)
    o3 = req("PATCH", f"/orders/{oid}/lines/{pouler['id']}", {"quantity": 3, "version": ver})["data"]
    ver = o3["version"]
    jobs = jobs_for_order(on)
    upd = [j for j in jobs if j["payloadJson"].get("ticketMode") == "UPDATE"]
    r3 = len(upd) >= 1
    results.append(("UPDATE_QTY_NO_CMID", r3, summarize_job(upd[-1]) if upd else None))

    pouler3 = next(i for i in o3["items"] if i["id"] == pouler["id"])
    o4 = req("PATCH", f"/orders/{oid}/lines/{pouler3['id']}", {"kitchenNotes": "sans sel", "version": ver})["data"]
    ver = o4["version"]
    jobs = jobs_for_order(on)
    note_upd = [j for j in jobs if j["payloadJson"].get("ticketMode") == "UPDATE"]
    r4 = len(note_upd) >= 2
    results.append(("NOTE_CHANGE", r4, summarize_job(note_upd[-1]) if note_upd else None))

    viande = next(i for i in o4["items"] if i["nameSnapshot"] == "Viande")
    o5 = req("DELETE", f"/orders/{oid}/lines/{viande['id']}?version={ver}")
    ver = o5["data"]["version"]
    jobs = jobs_for_order(on)
    cancel = [j for j in jobs if j["payloadJson"].get("ticketMode") == "CANCEL"]
    r5 = len(cancel) >= 1
    results.append(("DELETE", r5, summarize_job(cancel[-1]) if cancel else None))

    audit = audit_for(oid)
    r6 = len(audit) >= 5
    results.append(("AUDIT_TRAIL", r6, {"count": len(audit), "sample": audit[:3]}))

    # version conflict
    stale = req("POST", f"/orders/{oid}/kitchen/dispatch-pending", {"clientMutationId": cmid(), "version": 1})
    r7 = stale.get("error") == 409
    results.append(("VERSION_CONFLICT", r7, stale))

    for name, ok, detail in results:
        print(f"  {name}: {'PASS' if ok else 'FAIL'} {json.dumps(detail, default=str)[:120]}")

    return all(r[1] for r in results)

if __name__ == "__main__":
    a = run_blocker_a()
    b = run_food_scenarios()
    print(f"\nVERDICT: A={'PASS' if a else 'FAIL'} B/D={'PASS' if b else 'FAIL'}")
    sys.exit(0 if a and b else 1)
