/**
 * Storage abstraction: swap IndexedDB (browser), SQLite (desktop), or memory (tests)
 * without touching order/payment domain code.
 */
export interface LocalStoreDriver {
  readonly name: string;
  get<T>(key: string): Promise<T | undefined>;
  set<T>(key: string, value: T): Promise<void>;
  delete(key: string): Promise<void>;
  keys(prefix: string): Promise<string[]>;
  clear(): Promise<void>;
}
