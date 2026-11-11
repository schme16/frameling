// A very small promise wrapper around IndexedDB, just enough for the web build's own storage: recent files, file
// handles, browser copies of files, the autosave copies, and installed plugins and your templates.

export const STORES = ['recent', 'handles', 'copies', 'autosave', 'kept', 'library'] as const;
export type StoreName = (typeof STORES)[number];

export interface Db {
  get<T>(store: StoreName, key: string): Promise<T | undefined>;
  put(store: StoreName, key: string, value: unknown): Promise<void>;
  delete(store: StoreName, key: string): Promise<void>;
  /** Every value in a store. */
  all<T>(store: StoreName): Promise<T[]>;
  keys(store: StoreName): Promise<string[]>;
  clear(store: StoreName): Promise<void>;
}

const done = <T>(req: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

export function openDb(name = 'frameling', factory: IDBFactory = indexedDB): Promise<Db> {
  return new Promise((resolve, reject) => {
    // Version 2 added 'library' (plugins and templates). onupgradeneeded only creates what's missing.
    const req = factory.open(name, 2);
    req.onupgradeneeded = () => {
      for (const s of STORES) if (!req.result.objectStoreNames.contains(s)) req.result.createObjectStore(s);
    };
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const db = req.result;
      const run = async <T>(store: StoreName, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> => {
        const tx = db.transaction(store, mode);
        // Writes count once the transaction has finished, not when the request has.
        const finished = new Promise<void>((ok, bad) => {
          tx.oncomplete = () => ok();
          tx.onerror = () => bad(tx.error);
          tx.onabort = () => bad(tx.error);
        });
        const result = await done(fn(tx.objectStore(store)));
        if (mode === 'readwrite') await finished;
        else finished.catch(() => undefined);
        return result;
      };
      resolve({
        get: (store, key) => run(store, 'readonly', (s) => s.get(key)),
        put: async (store, key, value) => void (await run(store, 'readwrite', (s) => s.put(value, key))),
        delete: async (store, key) => void (await run(store, 'readwrite', (s) => s.delete(key))),
        all: (store) => run(store, 'readonly', (s) => s.getAll()),
        keys: async (store) => (await run(store, 'readonly', (s) => s.getAllKeys())).map(String),
        clear: async (store) => void (await run(store, 'readwrite', (s) => s.clear())),
      });
    };
  });
}

/** The same shape in memory, for when IndexedDB is missing or blocked (some private windows). Lasts for the visit. */
export function memoryDb(): Db {
  const data = new Map<StoreName, Map<string, unknown>>(STORES.map((s) => [s, new Map()]));
  const m = (s: StoreName) => data.get(s)!;
  return {
    get: async <T>(s: StoreName, k: string) => m(s).get(k) as T | undefined,
    put: async (s, k, v) => void m(s).set(k, v),
    delete: async (s, k) => void m(s).delete(k),
    all: async <T>(s: StoreName) => [...m(s).values()] as T[],
    keys: async (s) => [...m(s).keys()],
    clear: async (s) => m(s).clear(),
  };
}
