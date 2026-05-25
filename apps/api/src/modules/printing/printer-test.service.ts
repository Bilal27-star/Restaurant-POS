import net from "node:net";

import { EscPosBuilder } from "../../core/printing/escpos/builder.js";

const DEFAULT_PORT = 9100;
const CONNECT_TIMEOUT_MS = 3000;

export type PrinterTestInput = {
  host: string;
  port?: number;
};

export type PrinterTestSuccess = {
  success: true;
  latency: number;
};

export type PrinterTestFailure = {
  success: false;
  error: string;
};

export type PrinterTestResult = PrinterTestSuccess | PrinterTestFailure;

export class PrinterTestService {
  async testPrinterConnection(input: PrinterTestInput): Promise<PrinterTestResult> {
    const port = input.port ?? DEFAULT_PORT;
    const startedAt = performance.now();

    try {
      await sendTestPayload(input.host, port);
      const latency = Math.round(performance.now() - startedAt);
      const result: PrinterTestSuccess = { success: true, latency };
      console.info("[PRINTER TEST SUCCESS]", { host: input.host, port, latency });
      return result;
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      console.info("[PRINTER TEST FAILED]", { host: input.host, port, error });
      return { success: false, error };
    }
  }
}

function buildTestPayload(): Uint8Array {
  return new EscPosBuilder(32)
    .init()
    .align(1)
    .line("PRINTER TEST")
    .feed(2)
    .build();
}

function sendTestPayload(host: string, port: number): Promise<void> {
  const payload = buildTestPayload();

  return new Promise((resolve, reject) => {
    const socket = net.createConnection(
      { host, port, timeout: CONNECT_TIMEOUT_MS },
      () => {
        socket.write(Buffer.from(payload), (writeErr) => {
          if (writeErr) {
            socket.destroy();
            reject(writeErr);
            return;
          }
          socket.end(() => resolve());
        });
      },
    );

    socket.once("error", reject);
    socket.once("timeout", () => {
      socket.destroy();
      reject(new Error("Connection timed out"));
    });
  });
}
