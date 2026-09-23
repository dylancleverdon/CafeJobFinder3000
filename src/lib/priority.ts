import type { Category, PinQuality, Stage } from "@/db/schema";
import { isDue, isNewOpening } from "./dates";
import { haversine, type LatLng } from "./route/geo";

export type Rankable = {
  id: number;
  stage: Stage;
  nextActionAt: Date | string | null;
  interest: number;
  category: Category;
  licenseStartDate: string | null;
  hiringSign: boolean;
  mayHaveClosed: boolean;
  hidden: boolean;
  pinQuality: PinQuality;
  lat: number | null;
  lng: number | null;
};

const CATEGORY_BONUS: Record<Category, number> = { coffee: 15, bakery: 8, tea: 8, other: 0 };

/** Stages you can still walk into. */
export const OPEN_STAGES: ReadonlySet<Stage> = new Set(["discovered", "to_visit", "applied", "following_up", "revisit"]);
const WAITING_STAGES: ReadonlySet<Stage> = new Set(["applied", "following_up", "revisit"]);

/** Higher = visit sooner. Transparent on purpose so it's easy to tweak. */
export function priorityScore(c: Rankable, now: Date): number {
  let score = CATEGORY_BONUS[c.category] + c.interest * 10;
  if (isDue(c.nextActionAt, now)) score += 100;
  if (c.stage === "to_visit") score += 30;
  if (c.hiringSign) score += 40;
  if (isNewOpening(c.licenseStartDate, now)) score += 25;
  if (c.mayHaveClosed) score -= 50;
  return score;
}

/** Is this cafe something to walk into now (not waiting on a future follow-up date)? */
export function isVisitable(c: Rankable, now: Date): boolean {
  if (c.hidden || !OPEN_STAGES.has(c.stage)) return false;
  if (WAITING_STAGES.has(c.stage) || c.nextActionAt) return isDue(c.nextActionAt, now);
  return true;
}

export const AUTO_PICK_RADIUS_M = { walk: 2000, drive: 12000, park_walk: 12000 } as const;
const DISTANCE_PENALTY_PER_KM = { walk: 12, drive: 2, park_walk: 3 } as const;

export function autoPick<T extends Rankable>(
  cafes: T[],
  opts: { start: LatLng; mode: keyof typeof AUTO_PICK_RADIUS_M; maxStops: number; now: Date },
): T[] {
  const radius = AUTO_PICK_RADIUS_M[opts.mode];
  return cafes
    .filter((c) => c.pinQuality === "exact" && c.lat != null && c.lng != null && isVisitable(c, opts.now))
    .map((c) => ({ c, d: haversine(opts.start, { lat: c.lat!, lng: c.lng! }) }))
    .filter(({ d }) => d <= radius)
    .map(({ c, d }) => ({ c, s: priorityScore(c, opts.now) - (d / 1000) * DISTANCE_PENALTY_PER_KM[opts.mode] }))
    .sort((a, b) => b.s - a.s)
    .slice(0, opts.maxStops)
    .map(({ c }) => c);
}
