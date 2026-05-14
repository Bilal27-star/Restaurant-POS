import { useQuery } from "@tanstack/react-query";
import { getAppApi } from "@/lib/app-api";
import type {
  AnalyticsOverviewDto,
  AnalyticsRevenueDto,
  AnalyticsTablesDto,
  AnalyticsTopItemsDto,
} from "@/types/analytics-dto";

function rangeForPeriod(period: "today" | "week" | "month" | "custom", from?: string, to?: string): { from: string; to: string } {
  if (period === "custom" && from && to) {
    return { from, to };
  }
  const now = new Date();
  const t = now.toISOString();
  if (period === "today") {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    return { from: start.toISOString(), to: t };
  }
  if (period === "month") {
    const start = new Date(now);
    start.setMonth(now.getMonth() - 1);
    return { from: start.toISOString(), to: t };
  }
  const start = new Date(now);
  start.setDate(now.getDate() - 7);
  return { from: start.toISOString(), to: t };
}

export function useAnalyticsOverviewQuery(period: "today" | "week" | "month" | "custom", from?: string, to?: string) {
  return useQuery({
    queryKey: ["analytics", "overview", period, from, to],
    queryFn: async () => {
      const { from: f, to: t } = rangeForPeriod(period, from, to);
      return getAppApi().analytics.overview({ from: f, to: t }) as Promise<AnalyticsOverviewDto>;
    },
    staleTime: 60 * 1000,
  });
}

export function useAnalyticsDashboardQuery() {
  return useQuery({
    queryKey: ["analytics", "dashboard"],
    queryFn: async () => {
      return getAppApi().analytics.dashboard() as Promise<Record<string, unknown>>;
    },
    staleTime: 60 * 1000,
  });
}

export function useAnalyticsRevenueQuery(
  period: "today" | "week" | "month" | "custom",
  granularity: "hour" | "day" | "week",
) {
  return useQuery({
    queryKey: ["analytics", "revenue", period, granularity],
    queryFn: async () => {
      const { from: f, to: t } = rangeForPeriod(period);
      return getAppApi().analytics.revenue({ from: f, to: t, granularity }) as Promise<AnalyticsRevenueDto>;
    },
    staleTime: 60 * 1000,
  });
}

export function useAnalyticsTopItemsQuery(period: "today" | "week" | "month" | "custom") {
  return useQuery({
    queryKey: ["analytics", "top-items", period],
    queryFn: async () => {
      const { from: f, to: t } = rangeForPeriod(period);
      return getAppApi().analytics.topItems({ from: f, to: t, limit: 5 }) as Promise<AnalyticsTopItemsDto>;
    },
    staleTime: 60 * 1000,
  });
}

export function useAnalyticsTablesQuery(period: "today" | "week" | "month" | "custom") {
  return useQuery({
    queryKey: ["analytics", "tables", period],
    queryFn: async () => {
      const { from: f, to: t } = rangeForPeriod(period);
      return getAppApi().analytics.tables({ from: f, to: t }) as Promise<AnalyticsTablesDto>;
    },
    staleTime: 60 * 1000,
  });
}
