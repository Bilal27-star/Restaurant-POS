import assert from "node:assert/strict";
import test from "node:test";

import { createOrderBody, patchOrderBody } from "./orders.validation.js";

const menuItemId = "550e8400-e29b-41d4-a716-446655440001";
const tableId = "550e8400-e29b-41d4-a716-446655440002";
const waiterId = "550e8400-e29b-41d4-a716-446655440003";

test("createOrderBody accepts optional waiterName on DINE_IN and TAKEAWAY", () => {
  for (const type of ["DINE_IN", "TAKEAWAY"] as const) {
    const parsed = createOrderBody.safeParse({
      type,
      ...(type === "DINE_IN" ? { tableId } : {}),
      waiterId,
      waiterName: "Jean Dupont",
      lines: [{ menuItemId, quantity: 1 }],
      clientMutationId: "cm-test-12345678",
    });
    assert.equal(parsed.success, true, `expected success for ${type}`);
    if (parsed.success) {
      assert.equal(parsed.data.waiterName, "Jean Dupont");
    }
  }
});

test("createOrderBody strips print-routing fields from line items", () => {
  const parsed = createOrderBody.safeParse({
    type: "DINE_IN",
    tableId,
    waiterName: "Serveur A",
    lines: [
      {
        menuItemId,
        quantity: 2,
        station: "HOT",
        waiterName: "must-not-persist-on-line",
      },
    ],
  });
  assert.equal(parsed.success, true);
  if (parsed.success) {
    const lineKeys = Object.keys(parsed.data.lines[0]).sort();
    assert.ok(lineKeys.includes("menuItemId"));
    assert.ok(!lineKeys.includes("station"));
    assert.ok(!lineKeys.includes("waiterName"));
  }
});

test("patchOrderBody accepts optional waiterName", () => {
  const parsed = patchOrderBody.safeParse({ waiterName: "Updated Name", version: 2 });
  assert.equal(parsed.success, true);
  if (parsed.success) {
    assert.equal(parsed.data.waiterName, "Updated Name");
  }
});
