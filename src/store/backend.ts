import type { Cafe, Photo, Settings } from "@/lib/types";

/**
 * What's stored per cafe: for built-in Seattle cafes only the fields you
 * changed (plus the visit log); for cafes you added, the whole record.
 */
export type CafeDoc = Partial<Cafe> & { custom?: boolean; deleted?: boolean };

export type RouteState = {
  mode: "walk" | "drive" | "park_walk";
  stopIds: string[];
  doneIds: string[];
  startZip: string | null;
  departAt: string; // "HH:MM"
  active: boolean;
};

export type Meta = { settings?: Partial<Settings>; route?: RouteState | null };

export type Unsub = () => void;

export interface Backend {
  kind: "claude" | "local";
  watchCafes(next: (docs: Map<string, CafeDoc>) => void, error: (message: string) => void): Unsub;
  watchMeta(next: (meta: Meta) => void, error: (message: string) => void): Unsub;
  /** Replace a cafe's stored doc; `null` deletes it. */
  writeCafe(id: string, doc: CafeDoc | null): Promise<void>;
  writeMeta(key: "settings" | "route", data: Record<string, unknown> | null): Promise<void>;
  photosFor(cafeId: string): Promise<Photo[]>;
  allPhotos(): Promise<Photo[]>;
  writePhoto(photo: Photo | { id: string; deleted: true }): Promise<void>;
}

/** Serializes writes per key so two quick taps never race each other. */
export function writeQueue() {
  const chains = new Map<string, Promise<unknown>>();
  return <T>(key: string, task: () => Promise<T>): Promise<T> => {
    const prev = chains.get(key) ?? Promise.resolve();
    const next = prev.catch(() => {}).then(task);
    chains.set(key, next);
    void next.finally(() => {
      if (chains.get(key) === next) chains.delete(key);
    });
    return next;
  };
}
