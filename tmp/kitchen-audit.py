#!/usr/bin/env python3
"""Kitchen delta duplicate-print audit helper."""
import json, sys, uuid, urllib.request, base64

BASE = "http://localhost:4000/api/v1"
TOKEN = open("/tmp/audit_token.txt").read().strip()
POULER = "33175e9a-99ce-4895-8779-fa22c6f5b2f4"
VIANDE = "66db3f5e-2673-4306-a75d-c526d0297481"
WAITER = "40b01b25-9284-495f-b9a8-83122982d463"

def req(method, path, body=None):
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(
        BASE + path,
        data=data,
        headers={"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json"},
        method=method,
    )
    with urllib.request.urlopen(r) as res:
        return json.load(res)

def cmid():
    return str(uuid.uuid4())

def summarize_job(job):
    p = job.get("payloadJson") or {}
    items = []
    for s in p.get("sections") or []:
        for ln in s.get("lines") or []:
            items.append({
                "section": s.get("kind"),
                "name": ln.get("name"),
                "qty": ln.get("qty"),
                "deltaQty": ln.get("deltaQty"),
                "kitchenNotes": ln.get("kitchenNotes"),
                "prevNotes": ln.get("previousKitchenNotes"),
            })
    if not items:
        for ln in p.get("lines") or []:
            items.append({"section": "LEGACY", "name": ln.get("name"), "qty": ln.get("qty")})
    return {
        "id": job["id"][:8],
        "createdAt": job.get("createdAt", "")[:19],
        "ticketMode": p.get("ticketMode"),
        "payloadVersion": p.get("payloadVersion"),
        "items": items,
    }

def list_jobs_since(since_iso=None, limit=20):
    data = req("GET", f"/print/jobs?limit={limit}")
    jobs = data.get("data") or []
    out = []
    for j in jobs:
        if since_iso and (j.get("createdAt") or "") < since_iso:
            continue
        full = req("GET", f"/print/jobs/{j['id']}")
        out.append(summarize_job(full["data"]))
    return out

def order_summary(o):
    return {
        "id": o["id"],
        "orderNumber": o.get("orderNumber"),
        "version": o.get("version"),
        "kitchenDispatchGeneration": o.get("kitchenDispatchGeneration"),
        "items": [
            {
                "id": it["id"],
                "name": it["nameSnapshot"],
                "qty": it["quantity"],
                "kitchenStatus": it.get("kitchenStatus"),
                "kitchenRevision": it.get("kitchenRevision"),
                "kitchenNotes": it.get("kitchenNotes"),
            }
            for it in o.get("items", [])
        ],
    }

def find_free_table():
    layout = req("GET", "/tables/layout")["data"]

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

    for t in walk(layout):
        if t.get("status") == "FREE":
            return t["id"], t.get("number")
    return None, None

def main():
    cmd = sys.argv[1] if len(sys.argv) > 1 else "help"
    if cmd == "free-table":
        tid, num = find_free_table()
        print(json.dumps({"tableId": tid, "number": num}))
    elif cmd == "jobs":
        print(json.dumps(list_jobs_since(limit=int(sys.argv[2]) if len(sys.argv) > 2 else 10), indent=2))
    elif cmd == "order":
        print(json.dumps(order_summary(req("GET", f"/orders/{sys.argv[2]}")["data"]), indent=2))

if __name__ == "__main__":
    main()
