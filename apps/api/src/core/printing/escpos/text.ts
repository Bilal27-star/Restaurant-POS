/**
 * Narrow-paper helpers: strip unsupported glyphs and wrap lines for thermal width.
 */

export function sanitizeThermalText(input: string): string {
  let out = "";
  for (const ch of input) {
    const c = ch.codePointAt(0)!;
    if (c > 0xff) {
      out += "?";
    } else if (c === 0x0a || c === 0x0d) {
      out += " ";
    } else {
      out += ch;
    }
  }
  return out;
}

export function wrapLine(line: string, width: number): string[] {
  const s = sanitizeThermalText(line);
  if (width < 1) return [s];
  if (s.length <= width) return [s];
  const out: string[] = [];
  for (let i = 0; i < s.length; i += width) {
    out.push(s.slice(i, i + width));
  }
  return out;
}

export function separator(char: string, width: number): string {
  const c = char.codePointAt(0)!;
  const safe = c > 0xff ? "-" : char;
  return safe.repeat(Math.max(1, width));
}

export function twoColumns(left: string, right: string, width: number): string {
  const L = sanitizeThermalText(left);
  const R = sanitizeThermalText(right);
  const gap = 1;
  if (L.length + R.length + gap <= width) {
    const pad = width - L.length - R.length;
    return L + " ".repeat(pad) + R;
  }
  const maxLeft = Math.max(8, width - R.length - gap);
  const leftCut = L.length > maxLeft ? `${L.slice(0, maxLeft - 1)}…` : L;
  const pad = width - leftCut.length - R.length;
  return leftCut + " ".repeat(Math.max(gap, pad)) + R;
}
