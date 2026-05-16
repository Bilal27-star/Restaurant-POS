import { logDataFlow } from "@/lib/desktop/data-flow-log";

export function logPageRoute(event: string, detail: Record<string, unknown>): void {
  logDataFlow(`page_${event}`, detail);
}
