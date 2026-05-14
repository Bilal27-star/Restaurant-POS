/** Parse user-entered DA amounts (spaces, commas tolerated). */
export function parseDaInput(raw: string): number {
  const compact = raw.replace(/\s/g, "").replace(/,/g, "").replace(/[^\d-]/g, "");
  if (!compact) return 0;
  const n = Number.parseInt(compact, 10);
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}
