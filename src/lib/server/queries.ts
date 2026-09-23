import { and, asc, desc, eq, gte, inArray, isNotNull, lte, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { cafes, interactions, photos, settings, type Cafe, type Settings } from "@/db/schema";
import { endOfDay, startOfWeek } from "@/lib/dates";
import { OUTREACH_TYPES } from "@/lib/followup";

export async function getSettings(): Promise<Settings> {
  const db = await getDb();
  const [row] = await db.select().from(settings).where(eq(settings.id, 1));
  if (row) return row;
  const [created] = await db.insert(settings).values({ id: 1 }).onConflictDoNothing().returning();
  return created ?? (await db.select().from(settings).where(eq(settings.id, 1)))[0];
}

/** Lean rows for the list, map and route planner. */
export const liteColumns = {
  id: cafes.id,
  name: cafes.name,
  address: cafes.address,
  zip: cafes.zip,
  lat: cafes.lat,
  lng: cafes.lng,
  pinQuality: cafes.pinQuality,
  category: cafes.category,
  stage: cafes.stage,
  nextActionAt: cafes.nextActionAt,
  interest: cafes.interest,
  isChain: cafes.isChain,
  hiringSign: cafes.hiringSign,
  mayHaveClosed: cafes.mayHaveClosed,
  licenseStartDate: cafes.licenseStartDate,
  hidden: cafes.hidden,
  phone: cafes.phone,
};

export type CafeLite = Omit<Pick<Cafe, keyof typeof liteColumns>, "nextActionAt"> & { nextActionAt: string | null };

export async function listCafesLite(): Promise<CafeLite[]> {
  const db = await getDb();
  const rows = await db.select(liteColumns).from(cafes).orderBy(asc(cafes.name));
  return rows.map((r) => ({ ...r, nextActionAt: r.nextActionAt ? r.nextActionAt.toISOString() : null }));
}

export async function getCafeDetail(id: number) {
  const db = await getDb();
  const [cafe] = await db.select().from(cafes).where(eq(cafes.id, id));
  if (!cafe) return null;
  const log = await db.select().from(interactions).where(eq(interactions.cafeId, id)).orderBy(desc(interactions.at));
  const pics = await db.select().from(photos).where(eq(photos.cafeId, id)).orderBy(desc(photos.takenAt));
  return { cafe, log, photos: pics };
}

export async function getTodayData(now: Date) {
  const db = await getDb();
  const due = await db
    .select(liteColumns)
    .from(cafes)
    .where(
      and(
        isNotNull(cafes.nextActionAt),
        lte(cafes.nextActionAt, endOfDay(now)),
        inArray(cafes.stage, ["discovered", "to_visit", "applied", "following_up", "revisit"]),
        eq(cafes.hidden, false),
      ),
    )
    .orderBy(asc(cafes.nextActionAt));
  const trials = await db
    .select(liteColumns)
    .from(cafes)
    .where(and(eq(cafes.stage, "trial"), isNotNull(cafes.nextActionAt)))
    .orderBy(asc(cafes.nextActionAt));
  const toVisit = await db
    .select(liteColumns)
    .from(cafes)
    .where(and(eq(cafes.stage, "to_visit"), eq(cafes.hidden, false), sql`${cafes.nextActionAt} is null`))
    .orderBy(desc(cafes.interest), asc(cafes.name))
    .limit(8);
  const [week] = await db
    .select({ n: sql<number>`count(distinct ${interactions.cafeId})::int` })
    .from(interactions)
    .where(and(gte(interactions.at, startOfWeek(now)), inArray(interactions.type, [...OUTREACH_TYPES])));
  const [counts] = await db
    .select({
      total: sql<number>`count(*)::int`,
      exact: sql<number>`count(*) filter (where ${cafes.pinQuality} = 'exact')::int`,
      needPins: sql<number>`count(*) filter (where ${cafes.pinQuality} <> 'exact' and ${cafes.address} is not null and ${cafes.geocodeTried} = false)::int`,
      active: sql<number>`count(*) filter (where ${cafes.stage} in ('applied','following_up','trial'))::int`,
    })
    .from(cafes);
  const recent = await db
    .select({ id: interactions.id, at: interactions.at, outcome: interactions.outcome, type: interactions.type, cafeId: cafes.id, cafeName: cafes.name })
    .from(interactions)
    .innerJoin(cafes, eq(cafes.id, interactions.cafeId))
    .orderBy(desc(interactions.at))
    .limit(5);
  const iso = <T extends { nextActionAt: Date | null }>(r: T) => ({ ...r, nextActionAt: r.nextActionAt?.toISOString() ?? null });
  return { due: due.map(iso), trials: trials.map(iso), toVisit: toVisit.map(iso), weekCount: week?.n ?? 0, counts, recent };
}
