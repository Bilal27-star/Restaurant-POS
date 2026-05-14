import type { CustomersRepository } from "./customers.repository.js";
import { ApiError } from "../../core/http/ApiError.js";

export class CustomersService {
  constructor(private readonly repo: CustomersRepository) {}

  async list(restaurantId: string) {
    return this.repo.findMany(restaurantId);
  }

  async search(restaurantId: string, query: string) {
    return this.repo.search(restaurantId, query);
  }

  async upsert(restaurantId: string, data: { id?: string; name: string; phone?: string; address?: string; notes?: string }) {
    if (data.id) {
      await this.repo.update(restaurantId, data.id, {
        name: data.name,
        phone: data.phone,
        address: data.address,
        notes: data.notes,
      });
      return { id: data.id };
    }

    // Try to find by phone if provided
    if (data.phone) {
      const existing = await this.repo.findFirst(restaurantId, { phone: data.phone });
      if (existing) {
        await this.repo.update(restaurantId, existing.id, {
          name: data.name,
          address: data.address,
          notes: data.notes,
        });
        return { id: existing.id };
      }
    }

    return this.repo.create(restaurantId, {
      name: data.name,
      phone: data.phone,
      address: data.address,
      notes: data.notes,
    });
  }
}
