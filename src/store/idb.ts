/** Tiny IndexedDB helper for photos (too big for localStorage). */
const DB = "cjf-data";
const STORE = "photos";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => {
      const s = req.result.createObjectStore(STORE, { keyPath: "id" });
      s.createIndex("cafeId", "cafeId");
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const req = fn(tx.objectStore(STORE));
        tx.oncomplete = () => resolve(req.result);
        tx.onerror = () => reject(tx.error);
      }),
  );
}

export const idbPhotos = {
  available: () => typeof indexedDB !== "undefined",
  forCafe: <T>(cafeId: string) => run<T[]>("readonly", (s) => s.index("cafeId").getAll(cafeId) as IDBRequest<T[]>),
  all: <T>() => run<T[]>("readonly", (s) => s.getAll() as IDBRequest<T[]>),
  put: (photo: object) => run("readwrite", (s) => s.put(photo)),
  delete: (id: string) => run("readwrite", (s) => s.delete(id)),
};
