import type { LocalStoreDriver } from "./local-store-driver.js";

const DB = "pos_offline_kv_v1";
const STORE = "kv";

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onerror = () => reject(r.error ?? new Error("IndexedDB request failed"));
    r.onsuccess = () => resolve(r.result);
  });
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("IndexedDB transaction failed"));
    tx.onabort = () => reject(tx.error ?? new Error("IndexedDB transaction aborted"));
  });
}

/**
 * Durable key-value JSON persistence for browser offline mode.
 * Values must be JSON-serializable. For large binary blobs (e.g. print bitmaps), use a dedicated store later.
 */
export class IndexedDbJsonStore implements LocalStoreDriver {
  readonly name = "indexeddb-json";

  constructor(private readonly dbName: string = DB) {}

  private async open(): Promise<IDBDatabase> {
    if (typeof indexedDB === "undefined") {
      throw new Error("indexedDB is not available in this environment");
    }
    return new Promise((resolve, reject) => {
      const open = indexedDB.open(this.dbName, 1);
      open.onupgradeneeded = () => {
        const db = open.result;
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: "key" });
        }
      };
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(open.error ?? new Error("IndexedDB open failed"));
    });
  }

  async get<T>(key: string): Promise<T | undefined> {
    const db = await this.open();
    try {
      const tx = db.transaction(STORE, "readonly");
      const st = tx.objectStore(STORE);
      const row = await req<{ key: string; value: unknown } | undefined>(st.get(key));
      await txDone(tx);
      return row?.value as T | undefined;
    } finally {
      db.close();
    }
  }

  async set<T>(key: string, value: T): Promise<void> {
    const db = await this.open();
    try {
      const tx = db.transaction(STORE, "readwrite");
      const st = tx.objectStore(STORE);
      st.put({ key, value });
      await txDone(tx);
    } finally {
      db.close();
    }
  }

  async delete(key: string): Promise<void> {
    const db = await this.open();
    try {
      const tx = db.transaction(STORE, "readwrite");
      const st = tx.objectStore(STORE);
      st.delete(key);
      await txDone(tx);
    } finally {
      db.close();
    }
  }

  async keys(prefix: string): Promise<string[]> {
    const db = await this.open();
    try {
      const tx = db.transaction(STORE, "readonly");
      const st = tx.objectStore(STORE);
      const all = await req<{ key: string }[]>(st.getAll());
      await txDone(tx);
      return all.map((r) => r.key).filter((k) => k.startsWith(prefix));
    } finally {
      db.close();
    }
  }

  async clear(): Promise<void> {
    const db = await this.open();
    try {
      const tx = db.transaction(STORE, "readwrite");
      const st = tx.objectStore(STORE);
      st.clear();
      await txDone(tx);
    } finally {
      db.close();
    }
  }
}
