import type { LucideIcon } from "lucide-react";

/** Distinct KPI atmospheres — aligned with Figma accent separation. */
export type KpiAccent = "pink" | "blue" | "orange" | "magenta";

export interface KpiConfig {
  id: string;
  icon: LucideIcon;
  accent: KpiAccent;
  value: string;
  label: string;
  hint: string;
  delta?: string;
  deltaPositive?: boolean;
  badge?: string;
}

export interface TopSellingItem {
  id: string;
  rank: string;
  name: string;
  sold: string;
  trendPct?: string;
  revenue: string;
  avg: string;
}

export interface RecentOrder {
  id: string;
  headline: string;
  timeAgo: string;
  amount: string;
  status: string;
  statusVariant: "preparing" | "ready" | "default";
}
