import type { RealtimeHub } from "./realtime-hub.js";

let hub: RealtimeHub | null = null;

export function registerRealtimeHub(next: RealtimeHub | null): void {
  hub = next;
}

export function getRealtimeHub(): RealtimeHub | null {
  return hub;
}
