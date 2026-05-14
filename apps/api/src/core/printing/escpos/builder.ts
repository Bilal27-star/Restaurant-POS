import { ESC, GS, LF } from "./constants.js";
import { separator, twoColumns, wrapLine } from "./text.js";

/**
 * Fluent ESC/POS byte builder. No I/O — safe for server-side render + queue.
 */
export class EscPosBuilder {
  private readonly parts: number[] = [];

  constructor(private readonly paperWidthChars: number) {}

  /** Initialize printer (reset mode). */
  init(): this {
    this.parts.push(ESC, 0x40);
    return this;
  }

  /** Left=0, center=1, right=2 */
  align(mode: 0 | 1 | 2): this {
    this.parts.push(ESC, 0x61, mode);
    return this;
  }

  bold(on: boolean): this {
    this.parts.push(ESC, 0x45, on ? 1 : 0);
    return this;
  }

  sizeNormal(): this {
    this.parts.push(GS, 0x21, 0x00);
    return this;
  }

  /** Double width+height (use sparingly on narrow paper). */
  sizeDouble(): this {
    this.parts.push(GS, 0x21, 0x11);
    return this;
  }

  rawBytes(bytes: ReadonlyArray<number>): this {
    for (const b of bytes) {
      this.parts.push(b & 0xff);
    }
    return this;
  }

  line(text = ""): this {
    for (const ln of wrapLine(text, this.paperWidthChars)) {
      for (let i = 0; i < ln.length; i++) {
        this.parts.push(ln.charCodeAt(i)! & 0xff);
      }
      this.parts.push(LF);
    }
    return this;
  }

  blank(count = 1): this {
    for (let i = 0; i < count; i++) {
      this.parts.push(LF);
    }
    return this;
  }

  rule(char = "-"): this {
    return this.line(separator(char, this.paperWidthChars));
  }

  rowLR(left: string, right: string): this {
    return this.line(twoColumns(left, right, this.paperWidthChars));
  }

  feed(n = 3): this {
    this.parts.push(ESC, 0x64, Math.min(255, Math.max(0, n)));
    return this;
  }

  /** Partial cut (common on thermal kiosk drivers). */
  cutPartial(): this {
    this.parts.push(GS, 0x56, 0x42, 0x00);
    return this;
  }

  /**
   * Cash drawer kick (Epson ESC/POS `ESC p m t1 t2`).
   * m: pin (0 or 1). t1/t2: pulse width in units of 2 ms (0–255).
   */
  openCashDrawer(pin: 0 | 1 = 0, onTime = 60, offTime = 120): this {
    const m = pin & 1;
    const t1 = Math.min(255, Math.max(0, onTime));
    const t2 = Math.min(255, Math.max(0, offTime));
    this.parts.push(ESC, 0x70, m, t1, t2);
    return this;
  }

  /**
   * Epson QR Code Model 2 (GS ( k). UTF-8 payload; keep short for reliability.
   * @see Epson ESC/POS QR Code Command Specification
   */
  qrModel2(data: string, maxUtf8Bytes = 600): this {
    const buf = Buffer.from(data, "utf8");
    if (buf.length > maxUtf8Bytes) {
      throw new Error("QR_PAYLOAD_TOO_LARGE");
    }
    this.rawBytes([GS, 0x28, 0x6b, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00]);
    this.rawBytes([GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x43, 0x08]);
    this.rawBytes([GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x45, 0x30]);
    let offset = 0;
    while (offset < buf.length) {
      const chunk = buf.subarray(offset, offset + 256);
      const n = chunk.length + 3;
      const pL = n & 0xff;
      const pH = (n >> 8) & 0xff;
      this.parts.push(GS, 0x28, 0x6b, pL, pH, 0x31, 0x50, 0x30);
      for (let i = 0; i < chunk.length; i++) {
        this.parts.push(chunk[i]!);
      }
      offset += chunk.length;
    }
    this.rawBytes([GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x51, 0x30]);
    return this;
  }

  getWidth(): number {
    return this.paperWidthChars;
  }

  build(): Uint8Array {
    return Uint8Array.from(this.parts);
  }
}
