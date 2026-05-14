import type { LocalStoreDriver } from "./local-store-driver.js";

/** In-memory store for unit tests and SSR fallbacks. */
export class MemoryLocalStore implements LocalStoreDriver {
  readonly name = "memory";
  private readonly map = new Map<string, unknown>();

  async get<T>(key: string): Promise<T | undefined> {
    return this.map.get(key) as T | undefined;
  }

  async set<T>(key: string, value: T): Promise<void> {
    this.map.set(key, value);
  }

  async delete(key: string): Promise<void> {
    this.map.delete(key);
  }

  async keys(prefix: string): Promise<string[]> {
    return [...this.map.keys()].filter((k) => k.startsWith(prefix));
  }

  async clear(): Promise<void> {
    this.map.clear();
  }
}
