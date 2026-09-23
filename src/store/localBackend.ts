import type { Photo } from "@/lib/types";
import type { Backend, CafeDoc, Meta } from "./backend";

/**
 * Fallback when the app is opened outside Claude (a saved copy, tests):
 * saves in this browser only.
 */
export function localBackend(storage: Storage | null = safeStorage()): Backend {
  const KEY = { cafes: "cjf:cafes", meta: "cjf:meta", photos: "cjf:photos" };
  const mem = new Map<string, string>();
  const read = <T>(k: string, fallback: T): T => {
    try {
      const raw = storage ? storage.getItem(k) : mem.get(k) ?? null;
      return raw ? (JSON.parse(raw) as T) : fallback;
    } catch {
      return fallback;
    }
  };
  const write = (k: string, v: unknown) => {
    const raw = JSON.stringify(v);
    try {
      if (storage) storage.setItem(k, raw);
      else mem.set(k, raw);
    } catch {
      mem.set(k, raw);
    }
  };
  const cafeListeners = new Set<(docs: Map<string, CafeDoc>) => void>();
  const metaListeners = new Set<(m: Meta) => void>();
  const cafes = () => new Map(Object.entries(read<Record<string, CafeDoc>>(KEY.cafes, {})));
  const meta = () => read<Meta>(KEY.meta, {});

  return {
    kind: "local",
    watchCafes(next) {
      cafeListeners.add(next);
      queueMicrotask(() => next(cafes()));
      return () => cafeListeners.delete(next);
    },
    watchMeta(next) {
      metaListeners.add(next);
      queueMicrotask(() => next(meta()));
      return () => metaListeners.delete(next);
    },
    async writeCafe(id, doc) {
      const all = read<Record<string, CafeDoc>>(KEY.cafes, {});
      if (doc) all[id] = JSON.parse(JSON.stringify(doc));
      else delete all[id];
      write(KEY.cafes, all);
      const snapshot = cafes();
      cafeListeners.forEach((l) => l(snapshot));
    },
    async writeMeta(key, data) {
      const m = meta() as Record<string, unknown>;
      if (data) m[key] = data;
      else delete m[key];
      write(KEY.meta, m);
      const snapshot = meta();
      metaListeners.forEach((l) => l(snapshot));
    },
    async photosFor(cafeId) {
      return read<Photo[]>(KEY.photos, []).filter((p) => p.cafeId === cafeId);
    },
    async allPhotos() {
      return read<Photo[]>(KEY.photos, []);
    },
    async writePhoto(photo) {
      const list = read<Photo[]>(KEY.photos, []).filter((p) => p.id !== photo.id);
      if (!("deleted" in photo)) list.push(photo);
      write(KEY.photos, list);
    },
  };
}

function safeStorage(): Storage | null {
  try {
    const s = globalThis.localStorage;
    s.setItem("cjf:probe", "1");
    s.removeItem("cjf:probe");
    return s;
  } catch {
    return null;
  }
}
