import { createHash } from "node:crypto";

import type { KitchenStation } from "@pos/database";

import type { KitchenDetectLine, KitchenLastSentSnapshotV1, KitchenSnapshotModifier } from "./kitchen-delta.types.js";

function sortedStringArray(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  return values
    .filter((v): v is string => typeof v === "string")
    .slice()
    .sort((a, b) => a.localeCompare(b));
}

/** @public */
export function sortedStringArrayFromUnknown(values: unknown): string[] {
  return sortedStringArray(values);
}

/** Build modifier multiset from order line modifiers (duplicate modifierId = count). */
export function buildModifierMultiset(
  modifiers: { modifierId: string | null; label: string }[],
): KitchenSnapshotModifier[] {
  const counts = new Map<string, KitchenSnapshotModifier>();
  for (const m of modifiers) {
    const key = `${m.modifierId ?? ""}\0${m.label}`;
    const existing = counts.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      counts.set(key, { modifierId: m.modifierId, label: m.label, count: 1 });
    }
  }
  return [...counts.values()].sort((a, b) => {
    const ak = `${a.modifierId ?? ""}\0${a.label}\0${a.count}`;
    const bk = `${b.modifierId ?? ""}\0${b.label}\0${b.count}`;
    return ak.localeCompare(bk);
  });
}

export function buildSnapshotFromLine(
  line: KitchenDetectLine,
  kitchenStation: KitchenStation | null,
): KitchenLastSentSnapshotV1 {
  return {
    v: 1,
    qty: line.quantity,
    modifiers: buildModifierMultiset(line.modifiers),
    removedIngredients: sortedStringArray(line.removedIngredients),
    kitchenNotes: line.kitchenNotes,
    nameSnapshot: line.nameSnapshot,
    kitchenStation,
  };
}

/** Canonical JSON for §6.3 hash — keys sorted at every object level. */
export function canonicalizeSnapshot(snapshot: KitchenLastSentSnapshotV1): KitchenLastSentSnapshotV1 {
  return {
    v: 1,
    qty: snapshot.qty,
    modifiers: snapshot.modifiers
      .map((m) => ({
        modifierId: m.modifierId,
        label: m.label,
        count: m.count,
      }))
      .sort((a, b) => {
        const ak = `${a.modifierId ?? ""}\0${a.label}\0${a.count}`;
        const bk = `${b.modifierId ?? ""}\0${b.label}\0${b.count}`;
        return ak.localeCompare(bk);
      }),
    removedIngredients: [...snapshot.removedIngredients].sort((a, b) => a.localeCompare(b)),
    kitchenNotes: snapshot.kitchenNotes,
    nameSnapshot: snapshot.nameSnapshot,
    kitchenStation: snapshot.kitchenStation,
  };
}

function canonicalJsonString(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJsonString(item)).join(",")}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort((a, b) => a.localeCompare(b));
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJsonString(obj[k])}`).join(",")}}`;
}

export function computeKitchenSnapshotHash(snapshot: KitchenLastSentSnapshotV1): string {
  const canonical = canonicalizeSnapshot(snapshot);
  return createHash("sha256").update(canonicalJsonString(canonical), "utf8").digest("hex");
}

export function parseKitchenLastSentSnapshot(raw: unknown): KitchenLastSentSnapshotV1 | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  if (o.v !== 1) return null;
  if (typeof o.qty !== "number") return null;
  if (typeof o.nameSnapshot !== "string") return null;
  if (!Array.isArray(o.modifiers) || !Array.isArray(o.removedIngredients)) return null;
  const modifiers: KitchenSnapshotModifier[] = [];
  for (const m of o.modifiers) {
    if (!m || typeof m !== "object" || Array.isArray(m)) return null;
    const row = m as Record<string, unknown>;
    if (typeof row.label !== "string" || typeof row.count !== "number") return null;
    modifiers.push({
      modifierId: typeof row.modifierId === "string" ? row.modifierId : null,
      label: row.label,
      count: row.count,
    });
  }
  const removedIngredients = o.removedIngredients.filter((x): x is string => typeof x === "string");
  const kitchenStation =
    o.kitchenStation === null ||
    o.kitchenStation === "PIZZA" ||
    o.kitchenStation === "PLATS" ||
    o.kitchenStation === "SNACK" ||
    o.kitchenStation === "CAFETERIA"
      ? (o.kitchenStation as KitchenStation | null)
      : null;
  return {
    v: 1,
    qty: o.qty,
    modifiers,
    removedIngredients,
    kitchenNotes: typeof o.kitchenNotes === "string" ? o.kitchenNotes : null,
    nameSnapshot: o.nameSnapshot,
    kitchenStation,
  };
}

export function snapshotFromCurrentLine(
  line: KitchenDetectLine,
  resolvedStation: KitchenStation | null,
): KitchenLastSentSnapshotV1 {
  return canonicalizeSnapshot(buildSnapshotFromLine(line, resolvedStation));
}

export function snapshotsEqual(a: KitchenLastSentSnapshotV1, b: KitchenLastSentSnapshotV1): boolean {
  return computeKitchenSnapshotHash(a) === computeKitchenSnapshotHash(b);
}

export function diffModifierLabels(
  before: KitchenSnapshotModifier[],
  after: KitchenSnapshotModifier[],
): { added: string[]; removed: string[] } {
  const labelMultiset = (rows: KitchenSnapshotModifier[]): Map<string, number> => {
    const m = new Map<string, number>();
    for (const r of rows) {
      m.set(r.label, (m.get(r.label) ?? 0) + r.count);
    }
    return m;
  };
  const b = labelMultiset(before);
  const a = labelMultiset(after);
  const allLabels = new Set([...b.keys(), ...a.keys()]);
  const added: string[] = [];
  const removed: string[] = [];
  for (const label of allLabels) {
    const diff = (a.get(label) ?? 0) - (b.get(label) ?? 0);
    for (let i = 0; i < diff; i++) added.push(label);
    for (let i = 0; i < -diff; i++) removed.push(label);
  }
  return { added, removed };
}

export function diffStringArrays(before: string[], after: string[]): { added: string[]; removed: string[] } {
  const count = (arr: string[]) => {
    const m = new Map<string, number>();
    for (const s of arr) m.set(s, (m.get(s) ?? 0) + 1);
    return m;
  };
  const b = count(before);
  const a = count(after);
  const keys = new Set([...b.keys(), ...a.keys()]);
  const added: string[] = [];
  const removed: string[] = [];
  for (const k of keys) {
    const diff = (a.get(k) ?? 0) - (b.get(k) ?? 0);
    for (let i = 0; i < diff; i++) added.push(k);
    for (let i = 0; i < -diff; i++) removed.push(k);
  }
  return { added, removed };
}
