import type { Photo } from "@/lib/types";
import { writeQueue, type Backend, type CafeDoc, type Meta } from "./backend";

// Minimal shape of the Claude artifact `db` capability we rely on.
type Snap = { id: string; exists: boolean; data(): Record<string, unknown> | undefined };
type QuerySnap = { docs: Snap[] };
type DbError = { code: string; message: string };
type DocRef = {
  set(data: Record<string, unknown>): Promise<void>;
  delete(): Promise<void>;
};
type Query = {
  where(field: string, op: string, value: unknown): Query;
  limit(n: number): Query;
  get(): Promise<QuerySnap>;
  onSnapshot(next: (s: QuerySnap) => void, error?: (e: DbError) => void): () => void;
};
type Collection = Query & { doc(id: string): DocRef };
export type ClaudeDb = { collection(path: string): Collection };

const clone = (v: Record<string, unknown> | undefined) => (v ? (JSON.parse(JSON.stringify(v)) as Record<string, unknown>) : {});

/** Everything saved to the artifact's own database in your Claude account. */
export function claudeBackend(db: ClaudeDb): Backend {
  const queue = writeQueue();
  const retry = async <T>(fn: () => Promise<T>): Promise<T> => {
    try {
      return await fn();
    } catch (e) {
      if ((e as DbError)?.code !== "unavailable") throw e;
      await new Promise((r) => setTimeout(r, 400 + Math.random() * 600));
      return fn();
    }
  };
  return {
    kind: "claude",
    watchCafes(next, error) {
      return db
        .collection("cafes")
        .limit(1000)
        .onSnapshot(
          (snap) => next(new Map(snap.docs.filter((d) => d.exists).map((d) => [d.id, clone(d.data()) as CafeDoc]))),
          (e) => error(e.message),
        );
    },
    watchMeta(next, error) {
      return db.collection("meta").onSnapshot(
        (snap) => {
          const meta: Meta = {};
          for (const d of snap.docs) {
            if (d.id === "settings") meta.settings = clone(d.data());
            if (d.id === "route") meta.route = clone(d.data()) as unknown as Meta["route"];
          }
          next(meta);
        },
        (e) => error(e.message),
      );
    },
    writeCafe(id, doc) {
      const ref = db.collection("cafes").doc(id);
      return queue(`cafes/${id}`, () => retry(() => (doc ? ref.set(JSON.parse(JSON.stringify(doc))) : ref.delete())));
    },
    writeMeta(key, data) {
      const ref = db.collection("meta").doc(key);
      return queue(`meta/${key}`, () => retry(() => (data ? ref.set(JSON.parse(JSON.stringify(data))) : ref.delete())));
    },
    async photosFor(cafeId) {
      const snap = await retry(() => db.collection("photos").where("cafeId", "==", cafeId).limit(100).get());
      return snap.docs.filter((d) => d.exists).map((d) => ({ ...(d.data() as Omit<Photo, "id">), id: d.id }));
    },
    async allPhotos() {
      const snap = await retry(() => db.collection("photos").limit(1000).get());
      return snap.docs.filter((d) => d.exists).map((d) => ({ ...(d.data() as Omit<Photo, "id">), id: d.id }));
    },
    writePhoto(photo) {
      const ref = db.collection("photos").doc(photo.id);
      return queue(`photos/${photo.id}`, () =>
        retry(() => ("deleted" in photo ? ref.delete() : ref.set({ cafeId: photo.cafeId, dataUrl: photo.dataUrl, takenAt: photo.takenAt }))),
      );
    },
  };
}
