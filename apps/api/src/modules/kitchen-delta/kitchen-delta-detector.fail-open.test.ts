import assert from "node:assert/strict";
import test from "node:test";

import { detectKitchenDispatchIntent } from "./kitchen-delta-detector.js";
import type { KitchenDetectContext, KitchenDetectLine } from "./kitchen-delta.types.js";
import { computeKitchenSnapshotHash, snapshotFromCurrentLine } from "./kitchen-snapshot.js";

const RESTAURANT_ID = "550e8400-e29b-41d4-a716-446655440010";
const ORDER_ID = "550e8400-e29b-41d4-a716-446655440011";
const CLIENT_MUTATION_ID = "cm-fail-open-test-12345678";

function detectLine(
  overrides: Partial<KitchenDetectLine> & Pick<KitchenDetectLine, "id" | "nameSnapshot">,
): KitchenDetectLine {
  return {
    menuItemId: "550e8400-e29b-41d4-a716-446655440099",
    quantity: 1,
    kitchenNotes: null,
    removedIngredients: [],
    kitchenStatus: "PENDING",
    kitchenStation: null,
    kitchenLastSentSnapshot: null,
    kitchenSnapshotHash: null,
    modifiers: [],
    menuItemKitchenStation: null,
    menuCategoryKitchenStation: null,
    menuCategoryName: null,
    ...overrides,
  };
}

function baseContext(): Omit<KitchenDetectContext, "mutationKind" | "lines"> {
  return {
    restaurantId: RESTAURANT_ID,
    orderId: ORDER_ID,
    orderNumber: "2026-000001",
    tableNumber: null,
    orderType: "TAKEAWAY",
    waiterName: "Test Waiter",
    kitchenNotes: null,
    clientMutationId: CLIENT_MUTATION_ID,
  };
}

const pizzaLine = detectLine({
  id: "line-pizza",
  nameSnapshot: "Pizza Viande",
  menuCategoryKitchenStation: "PIZZA",
  menuCategoryName: "Pizza",
});

const cafeteriaLine = detectLine({
  id: "line-cola",
  nameSnapshot: "Coca",
  menuCategoryKitchenStation: "CAFETERIA",
  menuCategoryName: "Cafeteria",
});

const unknownLine = detectLine({
  id: "line-custom",
  nameSnapshot: "Custom Product",
  menuCategoryName: "Apéritifs",
});

function sentPizzaLine(quantity: number): KitchenDetectLine {
  const line = detectLine({
    id: "line-pizza",
    nameSnapshot: "Pizza Viande",
    menuCategoryKitchenStation: "PIZZA",
    menuCategoryName: "Pizza",
    kitchenStatus: "SENT",
    kitchenStation: "PIZZA",
    quantity,
  });
  const snap = snapshotFromCurrentLine(line, "PIZZA");
  return {
    ...line,
    kitchenLastSentSnapshot: snap,
    kitchenSnapshotHash: computeKitchenSnapshotHash(snap),
  };
}

test("CREATE: Pizza + Unknown => Pizza ticket only", () => {
  const intent = detectKitchenDispatchIntent({
    ...baseContext(),
    mutationKind: "CREATE",
    lines: [pizzaLine, unknownLine],
  });
  assert.ok(intent);
  assert.equal(intent.mutationKind, "CREATE");
  assert.deepEqual(
    intent.stationBundles.map((b) => b.station),
    ["PIZZA"],
  );
});

test("CREATE: Pizza + Cafeteria + Unknown => both routed stations", () => {
  const intent = detectKitchenDispatchIntent({
    ...baseContext(),
    mutationKind: "CREATE",
    lines: [pizzaLine, cafeteriaLine, unknownLine],
  });
  assert.ok(intent);
  assert.deepEqual(
    intent.stationBundles.map((b) => b.station).sort(),
    ["CAFETERIA", "PIZZA"],
  );
});

test("CREATE: only unknown => no intent", () => {
  const intent = detectKitchenDispatchIntent({
    ...baseContext(),
    mutationKind: "CREATE",
    lines: [unknownLine],
  });
  assert.equal(intent, null);
});

test("LINE_ADD: routed + unknown added lines => routed ticket only", () => {
  const intent = detectKitchenDispatchIntent({
    ...baseContext(),
    mutationKind: "LINE_ADD",
    addedLineIds: ["line-pizza", "line-custom"],
    lines: [pizzaLine, unknownLine],
  });
  assert.ok(intent);
  assert.equal(intent.mutationKind, "LINE_ADD");
  assert.deepEqual(
    intent.stationBundles.map((b) => b.station),
    ["PIZZA"],
  );
});

test("LINE_ADD: only unknown added line => no intent", () => {
  const intent = detectKitchenDispatchIntent({
    ...baseContext(),
    mutationKind: "LINE_ADD",
    addedLineIds: ["line-custom"],
    lines: [sentPizzaLine(1), unknownLine],
  });
  assert.equal(intent, null);
});

test("LINE_UPDATE: quantity change on sent pizza succeeds with unknown on order", () => {
  const before = sentPizzaLine(1);
  const after = sentPizzaLine(2);
  const intent = detectKitchenDispatchIntent({
    ...baseContext(),
    mutationKind: "LINE_UPDATE",
    lineId: "line-pizza",
    beforeLine: before,
    lines: [after, unknownLine],
  });
  assert.ok(intent);
  assert.equal(intent.mutationKind, "LINE_UPDATE");
  assert.equal(intent.ticketMode, "UPDATE");
  assert.deepEqual(
    intent.stationBundles.map((b) => b.station),
    ["PIZZA"],
  );
});

test("FULL_REPRINT: reprints routed sent lines only", () => {
  const intent = detectKitchenDispatchIntent({
    ...baseContext(),
    mutationKind: "FULL_REPRINT",
    lines: [sentPizzaLine(1), cafeteriaLine, unknownLine],
  });
  assert.ok(intent);
  assert.equal(intent.mutationKind, "FULL_REPRINT");
  assert.deepEqual(
    intent.stationBundles.map((b) => b.station),
    ["PIZZA"],
  );
});
