"use server";

import { and, eq, inArray, isNotNull, ne, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "@/db";
import { cafes, interactions, photos, settings, CATEGORIES, STAGES, type Category, type InteractionType, type NewCafe, type Source, type Stage } from "@/db/schema";
import seed from "@/data/seattle-cafes.seed.json";
import { SESSION_COOKIE, createSessionToken, passwordMatches, sessionCookieOptions } from "@/lib/auth";
import { parseDateInput } from "@/lib/dates";
import { applyQuickAction, QUICK_ACTIONS, type QuickAction } from "@/lib/followup";
import { CENSUS_BATCH_SIZE, geocodeBatch, geocodeOne } from "@/lib/geocode/census";
import { zipCentroid } from "@/lib/geocode/zipCentroid";
import { isShortLink, parseMapsUrl, parseSharedText, resolveShortLink, type ParsedPlace } from "@/lib/gmaps-link";
import { isSamePlace, stripUnit } from "@/lib/import/dedupe";
import { diffLicenseImport, type LicenseCandidate } from "@/lib/import/seattleLicense";
import { isChain } from "@/lib/chains";
import { getSettings } from "@/lib/server/queries";

const refresh = () => revalidatePath("/", "layout");

// ---------- auth ----------

export async function login(_: { error?: string } | undefined, form: FormData): Promise<{ error?: string }> {
  const password = String(form.get("password") ?? "");
  const next = String(form.get("next") ?? "/");
  if (!process.env.APP_PASSWORD) return { error: "APP_PASSWORD isn't set on the server yet — see the README." };
  if (!passwordMatches(password)) return { error: "Wrong password" };
  (await cookies()).set(SESSION_COOKIE, await createSessionToken(), sessionCookieOptions);
  redirect(next.startsWith("/") && !next.startsWith("//") ? next : "/");
}

export async function logout() {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/login");
}

// ---------- pipeline ----------

export async function quickAction(cafeId: number, action: QuickAction, opts: { date?: string; contactName?: string; note?: string } = {}) {
  if (!QUICK_ACTIONS.includes(action)) throw new Error("Unknown action");
  const db = await getDb();
  const [cafe] = await db.select().from(cafes).where(eq(cafes.id, cafeId));
  if (!cafe) throw new Error("Cafe not found");
  const s = await getSettings();
  const result = applyQuickAction(cafe, action, {
    now: new Date(),
    date: opts.date ? parseDateInput(opts.date) : null,
    settings: { followUpDays: s.followUpDays, followUpAgainDays: s.followUpAgainDays, revisitDays: s.revisitDays },
  });
  const contactName = opts.contactName?.trim() || null;
  await db.transaction(async (tx) => {
    await tx
      .update(cafes)
      .set({
        stage: result.stage,
        nextActionAt: result.nextActionAt,
        noAnswerCount: result.noAnswerCount,
        managerName: contactName && action === "talked_to_manager" && !cafe.managerName ? contactName : cafe.managerName,
        updatedAt: new Date(),
      })
      .where(eq(cafes.id, cafeId));
    await tx.insert(interactions).values({
      cafeId,
      type: result.interaction.type,
      outcome: result.interaction.outcome,
      contactName,
      note: opts.note?.trim() || null,
    });
  });
  refresh();
  return { stage: result.stage, nextActionAt: result.nextActionAt?.toISOString() ?? null };
}

const LOG_TYPES: InteractionType[] = ["call", "email", "dm", "note", "walk_in", "follow_up"];

export async function addLogEntry(cafeId: number, type: InteractionType, note: string, contactName?: string) {
  if (!LOG_TYPES.includes(type)) throw new Error("Unknown type");
  const db = await getDb();
  await db.insert(interactions).values({ cafeId, type, note: note.trim() || null, contactName: contactName?.trim() || null });
  await db.update(cafes).set({ updatedAt: new Date() }).where(eq(cafes.id, cafeId));
  refresh();
}

export async function deleteLogEntry(id: number) {
  const db = await getDb();
  await db.delete(interactions).where(eq(interactions.id, id));
  refresh();
}

export type CafePatch = Partial<{
  name: string;
  address: string | null;
  zip: string | null;
  phone: string | null;
  website: string | null;
  instagram: string | null;
  googleMapsUrl: string | null;
  managerName: string | null;
  bestTimeNote: string | null;
  notes: string | null;
  interest: number;
  hidden: boolean;
  hiringSign: boolean;
  stage: Stage;
  category: Category;
  nextActionAt: string | null;
}>;

export async function updateCafe(cafeId: number, patch: CafePatch) {
  const db = await getDb();
  const set: Partial<NewCafe> = { updatedAt: new Date() };
  for (const key of ["address", "zip", "phone", "website", "instagram", "googleMapsUrl", "managerName", "bestTimeNote", "notes"] as const) {
    if (key in patch) {
      const v = patch[key];
      set[key] = typeof v === "string" ? v.trim() || null : null;
    }
  }
  if (patch.name?.trim()) set.name = patch.name.trim();
  if (patch.interest !== undefined) set.interest = Math.max(0, Math.min(5, Math.round(patch.interest)));
  if (patch.hidden !== undefined) set.hidden = patch.hidden;
  if (patch.hiringSign !== undefined) set.hiringSign = patch.hiringSign;
  if (patch.stage && STAGES.includes(patch.stage)) set.stage = patch.stage;
  if (patch.category && CATEGORIES.includes(patch.category)) set.category = patch.category;
  if ("nextActionAt" in patch) set.nextActionAt = patch.nextActionAt ? parseDateInput(patch.nextActionAt) : null;
  const [before] = await db.select({ stage: cafes.stage }).from(cafes).where(eq(cafes.id, cafeId));
  await db.update(cafes).set(set).where(eq(cafes.id, cafeId));
  if (set.stage && before && before.stage !== set.stage) {
    await db.insert(interactions).values({ cafeId, type: "stage_change", outcome: `Moved to ${set.stage.replace("_", " ")}` });
  }
  if (set.address !== undefined) await db.update(cafes).set({ geocodeTried: false }).where(eq(cafes.id, cafeId));
  refresh();
}

export async function setCafeLocation(cafeId: number, lat: number, lng: number) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) throw new Error("Bad location");
  const db = await getDb();
  await db.update(cafes).set({ lat, lng, pinQuality: "exact", updatedAt: new Date() }).where(eq(cafes.id, cafeId));
  refresh();
}

export async function deleteCafe(cafeId: number) {
  const db = await getDb();
  await db.delete(cafes).where(eq(cafes.id, cafeId));
  refresh();
  redirect("/cafes");
}

export async function addPhoto(cafeId: number, dataUrl: string) {
  if (!/^data:image\/(jpeg|png|webp);base64,/.test(dataUrl) || dataUrl.length > 1_500_000) throw new Error("Photo too large");
  const db = await getDb();
  await db.insert(photos).values({ cafeId, dataUrl });
  refresh();
}

export async function deletePhoto(id: number) {
  const db = await getDb();
  await db.delete(photos).where(eq(photos.id, id));
  refresh();
}

// ---------- adding cafes ----------

export type NewCafeInput = {
  name: string;
  address?: string | null;
  zip?: string | null;
  lat?: number | null;
  lng?: number | null;
  exactPin?: boolean;
  googleMapsUrl?: string | null;
  instagram?: string | null;
  website?: string | null;
  phone?: string | null;
  notes?: string | null;
  category?: Category;
  hiringSign?: boolean;
  source: Source;
  stage?: Stage;
  photo?: string | null;
};

/** Returns the new cafe id, or the id of an existing cafe that looks like the same place. */
export async function createCafe(
  input: NewCafeInput,
  opts: { allowDuplicate?: boolean } = {},
): Promise<{ id: number; duplicate: boolean; pinUpdated?: boolean }> {
  const name = input.name.trim();
  if (!name) throw new Error("Give it a name");
  const db = await getDb();
  if (!opts.allowDuplicate) {
    const existing = await db
      .select({ id: cafes.id, name: cafes.name, address: cafes.address, lat: cafes.lat, lng: cafes.lng, pinQuality: cafes.pinQuality })
      .from(cafes);
    const dupe = existing.find((e) => isSamePlace(e.pinQuality === "exact" ? e : { ...e, lat: null, lng: null }, { name, address: input.address, lat: input.lat, lng: input.lng }));
    if (dupe) {
      // Sharing a cafe you already have from Google Maps upgrades its pin.
      const exact = input.lat != null && input.lng != null && input.exactPin !== false;
      if (exact && dupe.pinQuality !== "exact") {
        await db
          .update(cafes)
          .set({ lat: input.lat, lng: input.lng, pinQuality: "exact", googleMapsUrl: input.googleMapsUrl ?? null, updatedAt: new Date() })
          .where(eq(cafes.id, dupe.id));
        refresh();
        return { id: dupe.id, duplicate: true, pinUpdated: true };
      }
      return { id: dupe.id, duplicate: true };
    }
  }
  const zip = input.zip?.trim().slice(0, 5) || /\b(9[89]\d{3})\b/.exec(input.address ?? "")?.[1] || null;
  let lat = input.lat ?? null;
  let lng = input.lng ?? null;
  let pinQuality: "exact" | "approximate" | "none" = lat != null && lng != null ? (input.exactPin === false ? "approximate" : "exact") : "none";
  if (pinQuality === "none" && input.address?.trim()) {
    try {
      const addr = /seattle|, wa\b/i.test(input.address) ? input.address : `${input.address}, Seattle, WA ${zip ?? ""}`;
      const hit = await geocodeOne(addr, (u, init) => fetch(u, { ...init, signal: AbortSignal.timeout(8000) }));
      if (hit) [lat, lng, pinQuality] = [hit.lat, hit.lng, "exact"];
    } catch {
      /* fall back to the ZIP center below */
    }
  }
  if (pinQuality === "none") {
    const c = zipCentroid(zip);
    if (c) [lat, lng, pinQuality] = [c.lat, c.lng, "approximate"];
  }
  const [row] = await db
    .insert(cafes)
    .values({
      name,
      address: input.address?.trim() || null,
      zip,
      lat,
      lng,
      pinQuality,
      googleMapsUrl: input.googleMapsUrl || null,
      instagram: input.instagram?.trim() || null,
      website: input.website?.trim() || null,
      phone: input.phone?.trim() || null,
      notes: input.notes?.trim() || null,
      category: input.category ?? "coffee",
      hiringSign: !!input.hiringSign,
      isChain: isChain(name),
      source: input.source,
      stage: input.stage ?? (input.hiringSign ? "to_visit" : "discovered"),
    })
    .returning({ id: cafes.id });
  if (input.photo) await addPhoto(row.id, input.photo);
  await db.insert(interactions).values({ cafeId: row.id, type: "note", outcome: input.hiringSign ? "Spotted a Now Hiring sign" : "Added" });
  refresh();
  return { id: row.id, duplicate: false };
}

/** Reads a pasted/shared Google Maps link. Short links are expanded here (server-side, plain HTTP). */
export async function readMapsLink(text: string, title?: string | null): Promise<ParsedPlace & { error?: string }> {
  const shared = parseSharedText(text, title);
  let result: ParsedPlace = shared;
  try {
    if (shared.url && isShortLink(shared.url)) {
      const full = await resolveShortLink(shared.url);
      const parsed = parseMapsUrl(full);
      result = {
        url: shared.url,
        name: parsed.name ?? shared.name,
        address: parsed.address ?? shared.address,
        lat: parsed.lat,
        lng: parsed.lng,
        precision: parsed.precision,
      };
    }
  } catch {
    return { ...shared, error: "Couldn't open that link — you can still save it and fix the pin later." };
  }
  // No coordinates but an address → look the address up.
  if (result.lat == null && result.address) {
    try {
      const hit = await geocodeOne(result.address.includes(",") ? result.address : `${result.address}, Seattle, WA`);
      if (hit) result = { ...result, lat: hit.lat, lng: hit.lng, precision: "place" };
    } catch {
      /* leave without a pin */
    }
  }
  return result;
}

export async function lookUpAddress(address: string) {
  try {
    return await geocodeOne(address);
  } catch {
    return null;
  }
}

// ---------- imports ----------

type SeedFile = { source: string; sourceDate: string | null; cafes: LicenseCandidate[] };

export async function licenseImportPreview(candidates: LicenseCandidate[]) {
  const db = await getDb();
  const existing = await db
    .select({ licenseKey: cafes.licenseKey, mayHaveClosed: cafes.mayHaveClosed })
    .from(cafes)
    .where(isNotNull(cafes.licenseKey));
  const diff = diffLicenseImport(existing as { licenseKey: string; mayHaveClosed: boolean }[], candidates);
  return { added: diff.added.length, unchanged: diff.unchanged.length, missing: diff.missing.length, returned: diff.returned.length };
}

export async function applyLicenseImport(candidates: LicenseCandidate[]) {
  const db = await getDb();
  const existing = await db
    .select({ licenseKey: cafes.licenseKey, mayHaveClosed: cafes.mayHaveClosed })
    .from(cafes)
    .where(isNotNull(cafes.licenseKey));
  const diff = diffLicenseImport(existing as { licenseKey: string; mayHaveClosed: boolean }[], candidates);
  await db.transaction(async (tx) => {
    for (let i = 0; i < diff.added.length; i += 200) {
      await tx.insert(cafes).values(
        diff.added.slice(i, i + 200).map((c) => {
          const center = zipCentroid(c.zip);
          return {
            name: c.name,
            legalName: c.legalName,
            address: c.address,
            zip: c.zip,
            phone: c.phone,
            naics: c.naics,
            category: c.category,
            licenseKey: c.licenseKey,
            licenseStartDate: c.licenseStartDate,
            isChain: c.isChain,
            source: "license" as const,
            lat: center?.lat ?? null,
            lng: center?.lng ?? null,
            pinQuality: center ? ("approximate" as const) : ("none" as const),
          };
        }),
      ).onConflictDoNothing();
    }
    if (diff.missing.length) await tx.update(cafes).set({ mayHaveClosed: true }).where(inArray(cafes.licenseKey, diff.missing));
    if (diff.returned.length) await tx.update(cafes).set({ mayHaveClosed: false }).where(inArray(cafes.licenseKey, diff.returned));
  });
  refresh();
  return { added: diff.added.length, unchanged: diff.unchanged.length, missing: diff.missing.length, returned: diff.returned.length };
}

export async function loadSeattleSeed() {
  return applyLicenseImport((seed as SeedFile).cafes);
}

export async function importSimple(
  rows: { name: string; address?: string | null; zip?: string | null; lat?: number | null; lng?: number | null; phone?: string | null; category?: Category; note?: string | null }[],
  source: Source,
) {
  const db = await getDb();
  const existing = (
    await db.select({ name: cafes.name, address: cafes.address, lat: cafes.lat, lng: cafes.lng, pinQuality: cafes.pinQuality }).from(cafes)
  ).map((e) => (e.pinQuality === "exact" ? e : { ...e, lat: null, lng: null }));
  let added = 0;
  let skipped = 0;
  for (const r of rows) {
    if (!r.name?.trim()) continue;
    if (existing.some((e) => isSamePlace(e, r))) {
      skipped++;
      continue;
    }
    const center = r.lat == null ? zipCentroid(r.zip) : null;
    await db.insert(cafes).values({
      name: r.name.trim(),
      address: r.address ?? null,
      zip: r.zip ?? null,
      phone: r.phone ?? null,
      notes: r.note ?? null,
      category: r.category ?? "coffee",
      isChain: isChain(r.name),
      source,
      lat: r.lat ?? center?.lat ?? null,
      lng: r.lng ?? center?.lng ?? null,
      pinQuality: r.lat != null ? "exact" : center ? "approximate" : "none",
    });
    existing.push({ name: r.name, address: r.address ?? null, lat: r.lat ?? null, lng: r.lng ?? null, pinQuality: r.lat != null ? "exact" : "none" });
    added++;
  }
  refresh();
  return { added, skipped };
}

// ---------- map pins (US Census geocoder, no key) ----------

export async function pinProgress() {
  const db = await getDb();
  const [row] = await db
    .select({
      total: sql<number>`count(*)::int`,
      exact: sql<number>`count(*) filter (where ${cafes.pinQuality} = 'exact')::int`,
      pending: sql<number>`count(*) filter (where ${cafes.pinQuality} <> 'exact' and ${cafes.address} is not null and ${cafes.geocodeTried} = false)::int`,
    })
    .from(cafes);
  return row;
}

/** Pins the next batch of addresses. Call repeatedly until `remaining` is 0. */
export async function pinNextBatch(): Promise<{ matched: number; tried: number; remaining: number; error?: string }> {
  const db = await getDb();
  const batch = await db
    .select({ id: cafes.id, address: cafes.address, zip: cafes.zip })
    .from(cafes)
    .where(and(ne(cafes.pinQuality, "exact"), isNotNull(cafes.address), eq(cafes.geocodeTried, false)))
    .limit(CENSUS_BATCH_SIZE);
  if (!batch.length) return { matched: 0, tried: 0, remaining: 0 };
  let hits;
  try {
    hits = await geocodeBatch(batch.map((b) => ({ id: b.id, street: stripUnit(b.address!), city: "Seattle", state: "WA", zip: b.zip })));
  } catch (e) {
    return { matched: 0, tried: 0, remaining: (await pinProgress()).pending, error: e instanceof Error ? e.message : "Geocoder unavailable" };
  }
  await db.transaction(async (tx) => {
    for (const b of batch) {
      const hit = hits.get(String(b.id));
      await tx
        .update(cafes)
        .set(hit ? { lat: hit.lat, lng: hit.lng, pinQuality: "exact", geocodeTried: true } : { geocodeTried: true })
        .where(eq(cafes.id, b.id));
    }
  });
  refresh();
  return { matched: hits.size, tried: batch.length, remaining: (await pinProgress()).pending };
}

export async function retryUnpinned() {
  const db = await getDb();
  await db.update(cafes).set({ geocodeTried: false }).where(ne(cafes.pinQuality, "exact"));
  refresh();
}

// ---------- settings + backup ----------

export async function saveSettings(patch: Partial<{
  homeLat: number | null;
  homeLng: number | null;
  homeLabel: string | null;
  windowStart: string;
  windowEnd: string;
  weeklyGoal: number;
  followUpDays: number;
  followUpAgainDays: number;
  revisitDays: number;
  dwellMinutes: number;
}>) {
  await getSettings();
  const db = await getDb();
  const clean: typeof patch = {};
  for (const [k, v] of Object.entries(patch)) {
    if (["weeklyGoal", "followUpDays", "followUpAgainDays", "revisitDays", "dwellMinutes"].includes(k)) {
      const n = Math.round(Number(v));
      if (Number.isFinite(n) && n >= 0 && n <= 365) (clean as Record<string, unknown>)[k] = n;
    } else if (k === "windowStart" || k === "windowEnd") {
      if (/^\d{2}:\d{2}$/.test(String(v))) (clean as Record<string, unknown>)[k] = v;
    } else (clean as Record<string, unknown>)[k] = v;
  }
  await db.update(settings).set(clean).where(eq(settings.id, 1));
  refresh();
}

export type Backup = {
  app: "cafejobfinder3000";
  version: 1;
  exportedAt: string;
  cafes: (typeof cafes.$inferSelect)[];
  interactions: (typeof interactions.$inferSelect)[];
  photos: (typeof photos.$inferSelect)[];
  settings: (typeof settings.$inferSelect)[];
};

export async function restoreBackup(json: string) {
  const data = JSON.parse(json) as Backup;
  if (data.app !== "cafejobfinder3000" || !Array.isArray(data.cafes)) throw new Error("That isn't a CafeJobFinder3000 backup");
  const db = await getDb();
  const dates = <T extends Record<string, unknown>>(row: T, keys: string[]) => {
    const out: Record<string, unknown> = { ...row };
    for (const k of keys) if (out[k]) out[k] = new Date(out[k] as string);
    return out as T;
  };
  await db.transaction(async (tx) => {
    await tx.delete(photos);
    await tx.delete(interactions);
    await tx.delete(cafes);
    await tx.delete(settings);
    for (let i = 0; i < data.cafes.length; i += 200) {
      await tx.insert(cafes).values(data.cafes.slice(i, i + 200).map((c) => dates(c, ["nextActionAt", "createdAt", "updatedAt"])));
    }
    for (let i = 0; i < data.interactions.length; i += 500) {
      await tx.insert(interactions).values(data.interactions.slice(i, i + 500).map((r) => dates(r, ["at"])));
    }
    for (const p of data.photos) await tx.insert(photos).values(dates(p, ["takenAt"]));
    if (data.settings[0]) await tx.insert(settings).values(data.settings[0]);
    // Keep id sequences ahead of restored rows.
    await tx.execute(sql`select setval(pg_get_serial_sequence('cafes','id'), coalesce((select max(id) from cafes), 1))`);
    await tx.execute(sql`select setval(pg_get_serial_sequence('interactions','id'), coalesce((select max(id) from interactions), 1))`);
    await tx.execute(sql`select setval(pg_get_serial_sequence('photos','id'), coalesce((select max(id) from photos), 1))`);
  });
  refresh();
  return { cafes: data.cafes.length, interactions: data.interactions.length };
}
