import { getAccessToken, getAppApi } from "@/lib/app-api";
import { isTauriDesktop } from "@/lib/desktop/tauri-host";
import { sendEscPosViaBridge } from "@/lib/print/print-bridge";

const WORKER_ID_KEY = "pos_print_worker_id";

function workerId(): string {
  if (typeof sessionStorage === "undefined") {
    return `web-print-${Date.now()}`;
  }
  let id = sessionStorage.getItem(WORKER_ID_KEY);
  if (!id) {
    id = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `w-${Date.now()}`;
    sessionStorage.setItem(WORKER_ID_KEY, id);
  }
  return id;
}

type ClaimedJob = {
  id: string;
  escposBytesBase64?: string;
  printer: { connectionJson: unknown } | null;
};

function parseClaimResponse(raw: unknown): { job: ClaimedJob | null } {
  if (!raw || typeof raw !== "object") return { job: null };
  const o = raw as Record<string, unknown>;
  const j = o.job;
  if (!j || typeof j !== "object") return { job: null };
  const job = j as Record<string, unknown>;
  const id = typeof job.id === "string" ? job.id : "";
  if (!id) return { job: null };
  const esc = typeof job.escposBytesBase64 === "string" ? job.escposBytesBase64 : undefined;
  const pr = job.printer;
  const printer =
    pr && typeof pr === "object"
      ? { connectionJson: (pr as Record<string, unknown>).connectionJson as unknown }
      : null;
  return { job: { id, escposBytesBase64: esc, printer } };
}

/**
 * Polls the API print queue and sends raw ESC/POS to the Tauri bridge. Non-blocking for UI (uses `setInterval`).
 */
export class ThermalPrintWorker {
  private timer: ReturnType<typeof setInterval> | null = null;
  private busy = false;

  constructor(
    private readonly intervalMs: number,
    private readonly maxDispatchRetries: number,
  ) {}

  start(): void {
    if (!isTauriDesktop() || this.timer) return;
    this.timer = setInterval(() => void this.tick(), this.intervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  isRunning(): boolean {
    return this.timer != null;
  }

  private async tick(): Promise<void> {
    if (this.busy) return;
    if (!getAccessToken()) return;
    this.busy = true;
    try {
      await this.processOne();
    } finally {
      this.busy = false;
    }
  }

  private async processOne(): Promise<void> {
    const api = getAppApi();
    let claimed: { job: ClaimedJob | null };
    try {
      claimed = parseClaimResponse(await api.print.claim({ workerId: workerId() }));
    } catch {
      return;
    }
    const job = claimed.job;
    if (!job?.escposBytesBase64 || !job.printer?.connectionJson) {
      return;
    }
    const conn = job.printer.connectionJson;
    if (!conn || typeof conn !== "object") {
      await this.failJob(api, job.id, "Invalid printer connectionJson", true);
      return;
    }

    let lastErr = "";
    for (let attempt = 0; attempt < this.maxDispatchRetries; attempt++) {
      try {
        const ok = await sendEscPosViaBridge(job.escposBytesBase64, { connection: conn as Record<string, unknown> });
        if (!ok) {
          lastErr = "Print bridge not installed";
          await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
          continue;
        }
        await api.print.complete(job.id);
        return;
      } catch (e) {
        lastErr = e instanceof Error ? e.message : String(e);
        await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
      }
    }
    await this.failJob(api, job.id, lastErr || "Dispatch failed", true);
  }

  private async failJob(
    api: ReturnType<typeof getAppApi>,
    jobId: string,
    error: string,
    retry: boolean,
  ): Promise<void> {
    try {
      await api.print.fail(jobId, { error, retry });
    } catch {
      /* ignore */
    }
  }
}

let singleton: ThermalPrintWorker | null = null;

export function getThermalPrintWorker(): ThermalPrintWorker {
  if (!singleton) {
    singleton = new ThermalPrintWorker(2200, 3);
  }
  return singleton;
}

export function startThermalPrintWorker(): void {
  getThermalPrintWorker().start();
}

export function stopThermalPrintWorker(): void {
  singleton?.stop();
}
