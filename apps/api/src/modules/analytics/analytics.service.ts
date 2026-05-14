import type { AnalyticsRepository } from "./analytics.repository.js";
import type { RevenueGranularity } from "./analytics.types.js";

export class AnalyticsService {
  constructor(private readonly repo: AnalyticsRepository) {}

  overview(restaurantId: string, from: Date, to: Date) {
    return this.repo.overview(restaurantId, from, to);
  }

  dashboard(restaurantId: string, now?: Date) {
    return this.repo.getDashboard(restaurantId, now);
  }

  revenue(restaurantId: string, from: Date, to: Date, granularity: RevenueGranularity) {
    return this.repo.getRevenueSeries(restaurantId, from, to, granularity);
  }

  topItems(restaurantId: string, from: Date, to: Date, limit: number) {
    return this.repo.getTopItems(restaurantId, from, to, limit);
  }

  payments(restaurantId: string, from: Date, to: Date) {
    return this.repo.getPayments(restaurantId, from, to);
  }

  tables(restaurantId: string, from: Date, to: Date) {
    return this.repo.getTables(restaurantId, from, to);
  }

  peakHours(restaurantId: string, from: Date, to: Date) {
    return this.repo.getPeakHours(restaurantId, from, to);
  }
}
