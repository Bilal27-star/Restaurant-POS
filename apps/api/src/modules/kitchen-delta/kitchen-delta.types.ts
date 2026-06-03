import type { KitchenStation, OrderItemKitchenStatus } from "@pos/database";

/** Matches spec §15.1 — app-layer until Phase 1.5 ledger migration. */
export type KitchenMutationKind =
  | "CREATE"
  | "LINE_ADD"
  | "LINE_UPDATE"
  | "LINE_DELETE"
  | "DISPATCH_PENDING"
  | "ORDER_INFO"
  | "FULL_REPRINT";

export type KitchenTicketMode = "NEW" | "UPDATE" | "CANCEL" | "INFO" | "FULL_REPRINT";

export type KitchenDeltaSectionKind = "ADDED" | "REMOVED" | "MODIFIED" | "INFO";

/** Spec §6.2 — version 1 kitchen last-sent snapshot. */
export type KitchenLastSentSnapshotV1 = {
  v: 1;
  qty: number;
  modifiers: KitchenSnapshotModifier[];
  removedIngredients: string[];
  kitchenNotes: string | null;
  nameSnapshot: string;
  kitchenStation: KitchenStation | null;
};

export type KitchenSnapshotModifier = {
  modifierId: string | null;
  label: string;
  count: number;
};

export type KitchenDeltaLine = {
  orderItemId: string;
  nameSnapshot: string;
  qty: number;
  previousQty?: number;
  deltaQty?: number;
  modifiersAdded: string[];
  modifiersRemoved: string[];
  removedIngredients: string[];
  removedIngredientsAdded: string[];
  kitchenNotes: string | null;
  previousKitchenNotes?: string | null;
  kitchenStation: KitchenStation | null;
};

export type KitchenDeltaSection = {
  kind: KitchenDeltaSectionKind;
  lines: KitchenDeltaLine[];
  infoText?: string;
};

export type KitchenStationBundle = {
  station: KitchenStation;
  sections: KitchenDeltaSection[];
};

/** Spec §6.1 — full dispatch intent (payloadVersion 2 inside payloadJson at persistence). */
export type KitchenDispatchIntent = {
  payloadVersion: 2;
  ticketMode: KitchenTicketMode;
  mutationKind: KitchenMutationKind;
  clientMutationId: string;
  orderId: string;
  orderNumber: string;
  tableNumber: string | null;
  orderType: string;
  waiterName: string | null;
  orderKitchenNotes: string | null;
  stationBundles: KitchenStationBundle[];
};

/** Line shape used by detector (projected or loaded from DB). */
export type KitchenDetectLine = {
  id: string;
  menuItemId: string | null;
  nameSnapshot: string;
  quantity: number;
  kitchenNotes: string | null;
  removedIngredients: unknown;
  kitchenStatus: OrderItemKitchenStatus;
  kitchenStation: KitchenStation | null;
  kitchenLastSentSnapshot: unknown;
  kitchenSnapshotHash: string | null;
  modifiers: { modifierId: string | null; label: string }[];
  menuItemKitchenStation: KitchenStation | null;
  menuCategoryName: string | null;
};

export type KitchenDetectOrderContext = {
  orderId: string;
  orderNumber: string;
  tableNumber: string | null;
  orderType: string;
  waiterName: string | null;
  kitchenNotes: string | null;
  lines: KitchenDetectLine[];
};

export type KitchenDetectCreateContext = KitchenDetectOrderContext & {
  mutationKind: "CREATE";
  clientMutationId: string;
};

export type KitchenDetectLineAddContext = KitchenDetectOrderContext & {
  mutationKind: "LINE_ADD";
  clientMutationId: string;
  addedLineIds: string[];
};

export type KitchenDetectLineUpdateContext = KitchenDetectOrderContext & {
  mutationKind: "LINE_UPDATE";
  clientMutationId: string;
  lineId: string;
  /** Line state before mutation (for diff). */
  beforeLine: KitchenDetectLine;
};

export type KitchenDetectLineDeleteContext = KitchenDetectOrderContext & {
  mutationKind: "LINE_DELETE";
  clientMutationId: string;
  /** Line captured before delete. */
  deletedLine: KitchenDetectLine;
};

export type KitchenDetectDispatchPendingContext = KitchenDetectOrderContext & {
  mutationKind: "DISPATCH_PENDING";
  clientMutationId: string;
  /** Lines removed from the order since last kitchen dispatch (audit ledger). */
  removedLines: KitchenDetectLine[];
};

export type KitchenDetectOrderInfoContext = KitchenDetectOrderContext & {
  mutationKind: "ORDER_INFO";
  clientMutationId: string;
  previousKitchenNotes: string | null;
};

export type KitchenDetectFullReprintContext = KitchenDetectOrderContext & {
  mutationKind: "FULL_REPRINT";
  clientMutationId: string;
  lineIds?: string[];
};

export type KitchenDetectContext =
  | KitchenDetectCreateContext
  | KitchenDetectLineAddContext
  | KitchenDetectLineUpdateContext
  | KitchenDetectLineDeleteContext
  | KitchenDetectDispatchPendingContext
  | KitchenDetectOrderInfoContext
  | KitchenDetectFullReprintContext;

export type UnroutedLine = {
  orderItemId: string | null;
  nameSnapshot: string;
};

export type KitchenRoutingValidationResult =
  | { ok: true }
  | { ok: false; unroutedLines: UnroutedLine[] };

export type KitchenItemKitchenState = {
  orderItemId: string;
  kitchenStatus: OrderItemKitchenStatus;
  kitchenStation: KitchenStation | null;
  kitchenSentAt: Date | null;
  kitchenRevision: number;
  kitchenLastSentSnapshot: KitchenLastSentSnapshotV1 | null;
  kitchenSnapshotHash: string | null;
};

export type KitchenItemKitchenStatePatch = {
  kitchenStatus?: OrderItemKitchenStatus;
  kitchenStation?: KitchenStation | null;
  kitchenSentAt?: Date | null;
  kitchenRevision?: number;
  kitchenLastSentSnapshot?: KitchenLastSentSnapshotV1 | null;
  kitchenSnapshotHash?: string | null;
};
