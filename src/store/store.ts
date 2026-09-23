import { isChain } from "@/lib/chains";
import { applyQuickAction, OUTREACH_TYPES, type QuickAction } from "@/lib/followup";
import { addDays, endOfDay, isDue, parseDateInput, startOfWeek } from "@/lib/dates";
import { zipCentroid } from "@/lib/geocode/zipCentroid";
import { isShortLink, parseMapsUrl, parseSharedText, type ParsedPlace } from "@/lib/gmaps-link";
import { isSamePlace, normalizeName } from "@/lib/import/dedupe";
import { diffLicenseImport, type LicenseCandidate } from "@/lib/import/seattleLicense";
import { OPEN_STAGES } from "@/lib/priority";
import { DEFAULT_SETTINGS, STAGES, type Cafe, type Category, type InteractionType, type LogEntry, type Photo, type Settings, type Source, type Stage } from "@/lib/types";
import type { Backend, CafeDoc, Meta, RouteState } from "./backend";
import { newId } from "./ids";
import { blankCafe, cafeFromLicense, licenseCafeId, seedCafes } from "./seed";

export type StoreState = {
  ready: boolean;
  backend: Backend["kind"] | null;
  cafes: Cafe[];
  byId: Map<string, Cafe>;
  settings: Settings;
  route: RouteState | null;
  error: string | null;
};

// Fields you can override on a built-in cafe.
const OVERRIDE_KEYS = [
  "name", "address", "zip", "lat", "lng", "pinQuality", "googleMapsUrl", "website", "instagram", "phone", "category",
  "mayHaveClosed", "hiringSign", "interest", "managerName", "bestTimeNote", "stage", "nextActionAt", "noAnswerCount",
  "hidden", "notes", "log", "updatedAt",
] as const satisfies readonly (keyof Cafe)[];

export function mergeCafes(base: Cafe[], docs: Map<string, CafeDoc>): Cafe[] {
  const out: Cafe[] = [];
  const seen = new Set<string>();
  for (const b of base) {
    seen.add(b.id);
    const d = docs.get(b.id);
    if (d?.deleted) continue;
    out.push(d ? { ...b, ...pick(d) } : b);
  }
  for (const [id, d] of docs) {
    if (seen.has(id) || !d.custom || d.deleted) continue;
    const { custom: _c, deleted: _d, ...rest } = d;
    void _c;
    void _d;
    out.push({ ...blankCafe(id), ...rest, id });
  }
  return out;
}

function pick(d: CafeDoc): Partial<Cafe> {
  const out: Partial<Cafe> = {};
  for (const k of OVERRIDE_KEYS) if (k in d) (out as Record<string, unknown>)[k] = d[k];
  return out;
}

export function createStore(backend: Backend, base: Cafe[] = seedCafes()) {
  let docs = new Map<string, CafeDoc>();
  let meta: Meta = {};
  let state: StoreState = {
    ready: false,
    backend: backend.kind,
    cafes: base,
    byId: new Map(base.map((c) => [c.id, c])),
    settings: DEFAULT_SETTINGS,
    route: null,
    error: null,
  };
  let cafesLoaded = false;
  let metaLoaded = false;
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach((l) => l());
  const rebuild = () => {
    const cafes = mergeCafes(base, docs);
    state = {
      ...state,
      ready: cafesLoaded && metaLoaded,
      cafes,
      byId: new Map(cafes.map((c) => [c.id, c])),
      settings: { ...DEFAULT_SETTINGS, ...(meta.settings ?? {}) },
      route: meta.route ?? null,
    };
    emit();
  };
  const fail = (message: string) => {
    state = { ...state, error: message };
    emit();
  };

  backend.watchCafes(
    (d) => {
      docs = d;
      cafesLoaded = true;
      rebuild();
    },
    (m) => fail(`Couldn't load your saved cafes (${m}). Reload to try again.`),
  );
  backend.watchMeta(
    (m) => {
      meta = m;
      metaLoaded = true;
      rebuild();
    },
    (m) => fail(`Couldn't load your settings (${m}).`),
  );

  const isCustom = (id: string) => !!docs.get(id)?.custom || !base.some((b) => b.id === id);

  /** Apply a change locally right away, then save it. */
  async function saveCafe(id: string, patch: Partial<Cafe>) {
    const current = docs.get(id) ?? {};
    const doc: CafeDoc = { ...current, ...patch, updatedAt: new Date().toISOString() };
    if (!base.some((b) => b.id === id)) doc.custom = true;
    docs = new Map(docs).set(id, doc);
    rebuild();
    try {
      await backend.writeCafe(id, doc);
    } catch (e) {
      fail(`Couldn't save that change (${(e as Error)?.message ?? "offline?"}). Check your connection and try again.`);
      throw e;
    }
  }

  const get = (id: string) => {
    const c = state.byId.get(id);
    if (!c) throw new Error("That cafe isn't in your list anymore");
    return c;
  };
  const logEntry = (type: InteractionType, outcome: string | null, extra: Partial<LogEntry> = {}): LogEntry => ({
    id: newId("e"),
    at: new Date().toISOString(),
    type,
    outcome,
    contactName: extra.contactName ?? null,
    note: extra.note ?? null,
  });

  const api = {
    getState: () => state,
    subscribe(l: () => void) {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    dismissError() {
      state = { ...state, error: null };
      emit();
    },

    // ----- pipeline -----
    async quickAction(id: string, action: QuickAction, opts: { date?: string; contactName?: string; note?: string } = {}) {
      const cafe = get(id);
      const s = state.settings;
      const r = applyQuickAction(cafe, action, {
        now: new Date(),
        date: opts.date ? parseDateInput(opts.date) : null,
        settings: { followUpDays: s.followUpDays, followUpAgainDays: s.followUpAgainDays, revisitDays: s.revisitDays },
      });
      const contactName = opts.contactName?.trim() || null;
      await saveCafe(id, {
        stage: r.stage,
        nextActionAt: r.nextActionAt?.toISOString() ?? null,
        noAnswerCount: r.noAnswerCount,
        managerName: contactName && action === "talked_to_manager" && !cafe.managerName ? contactName : cafe.managerName,
        log: [logEntry(r.interaction.type, r.interaction.outcome, { contactName, note: opts.note?.trim() || null }), ...cafe.log],
      });
      return { stage: r.stage, nextActionAt: r.nextActionAt?.toISOString() ?? null };
    },

    async addLogEntry(id: string, type: InteractionType, note: string, contactName?: string) {
      const cafe = get(id);
      await saveCafe(id, { log: [logEntry(type, null, { note: note.trim() || null, contactName: contactName?.trim() || null }), ...cafe.log] });
    },

    async deleteLogEntry(id: string, entryId: string) {
      const cafe = get(id);
      await saveCafe(id, { log: cafe.log.filter((e) => e.id !== entryId) });
    },

    async updateCafe(id: string, patch: Partial<Omit<Cafe, "nextActionAt">> & { nextActionAt?: string | null }) {
      const cafe = get(id);
      const clean: Partial<Cafe> = {};
      for (const [k, v] of Object.entries(patch)) {
        if (k === "id" || k === "log") continue;
        (clean as Record<string, unknown>)[k] = typeof v === "string" ? v.trim() || null : v;
      }
      if (clean.name === null) delete clean.name;
      if ("nextActionAt" in patch) clean.nextActionAt = patch.nextActionAt ? parseDateInput(patch.nextActionAt)?.toISOString() ?? null : null;
      if (clean.interest !== undefined) clean.interest = Math.max(0, Math.min(5, Math.round(clean.interest)));
      if (clean.stage && !STAGES.includes(clean.stage)) delete clean.stage;
      if (clean.stage && clean.stage !== cafe.stage) clean.log = [logEntry("stage_change", `Moved to ${clean.stage.replace("_", " ")}`), ...cafe.log];
      await saveCafe(id, clean);
    },

    async setCafeLocation(id: string, lat: number, lng: number, googleMapsUrl?: string | null) {
      await saveCafe(id, { lat, lng, pinQuality: "exact", ...(googleMapsUrl ? { googleMapsUrl } : {}) });
    },

    async deleteCafe(id: string) {
      if (isCustom(id)) {
        docs = new Map(docs);
        docs.delete(id);
        rebuild();
        await backend.writeCafe(id, null);
      } else {
        docs = new Map(docs).set(id, { deleted: true });
        rebuild();
        await backend.writeCafe(id, { deleted: true });
      }
    },

    // ----- photos -----
    photosFor: (cafeId: string) => backend.photosFor(cafeId),
    async addPhoto(cafeId: string, dataUrl: string) {
      if (dataUrl.length > 240_000) throw new Error("That photo is too big — try again");
      const photo: Photo = { id: newId("p"), cafeId, dataUrl, takenAt: new Date().toISOString() };
      await backend.writePhoto(photo);
      return photo;
    },
    deletePhoto: (id: string) => backend.writePhoto({ id, deleted: true }),

    // ----- adding cafes -----
    async createCafe(input: {
      name: string;
      address?: string | null;
      zip?: string | null;
      lat?: number | null;
      lng?: number | null;
      exactPin?: boolean;
      googleMapsUrl?: string | null;
      instagram?: string | null;
      notes?: string | null;
      category?: Category;
      hiringSign?: boolean;
      source: Source;
      stage?: Stage;
    }): Promise<{ id: string; duplicate: boolean; pinUpdated?: boolean }> {
      const name = input.name.trim();
      if (!name) throw new Error("Give it a name");
      const exact = input.lat != null && input.lng != null && input.exactPin !== false;
      const dupe = state.cafes.find((c) =>
        isSamePlace(c.pinQuality === "exact" ? c : { ...c, lat: null, lng: null }, { name, address: input.address, lat: input.lat, lng: input.lng }),
      );
      if (dupe) {
        if (exact && dupe.pinQuality !== "exact") {
          await saveCafe(dupe.id, { lat: input.lat!, lng: input.lng!, pinQuality: "exact", googleMapsUrl: input.googleMapsUrl ?? dupe.googleMapsUrl });
          return { id: dupe.id, duplicate: true, pinUpdated: true };
        }
        if (input.googleMapsUrl && !dupe.googleMapsUrl) await saveCafe(dupe.id, { googleMapsUrl: input.googleMapsUrl });
        return { id: dupe.id, duplicate: true };
      }
      const zip = input.zip?.trim().slice(0, 5) || /\b(9[89]\d{3})\b/.exec(input.address ?? "")?.[1] || null;
      const center = zipCentroid(zip);
      const id = newId("u");
      const now = new Date().toISOString();
      await saveCafe(id, {
        ...blankCafe(id),
        name,
        address: input.address?.trim() || null,
        zip,
        lat: exact ? input.lat! : center?.lat ?? null,
        lng: exact ? input.lng! : center?.lng ?? null,
        pinQuality: exact ? "exact" : center ? "approximate" : "none",
        googleMapsUrl: input.googleMapsUrl || null,
        instagram: input.instagram?.trim() || null,
        notes: input.notes?.trim() || null,
        category: input.category ?? "coffee",
        hiringSign: !!input.hiringSign,
        isChain: isChain(name),
        source: input.source,
        stage: input.stage ?? (input.hiringSign ? "to_visit" : "discovered"),
        createdAt: now,
        log: [logEntry("note", input.hiringSign ? "Spotted a Now Hiring sign" : "Added")],
      });
      return { id, duplicate: false };
    },

    /** Reads a pasted Google Maps link or shared text — no network, no API. */
    readMapsLink(text: string): ParsedPlace & { match: Cafe | null; shortLinkOnly: boolean } {
      const shared = parseSharedText(text);
      const parsed = shared.url && !isShortLink(shared.url) ? { ...shared, ...stripNulls(parseMapsUrl(shared.url)) } : shared;
      const shortLinkOnly = !!parsed.url && isShortLink(parsed.url) && !parsed.name;
      let match: Cafe | null = null;
      if (parsed.name) {
        const n = normalizeName(parsed.name);
        const zip = /\b(9[89]\d{3})\b/.exec(parsed.address ?? "")?.[1];
        const candidates = state.cafes.filter((c) => normalizeName(c.name) === n || isSamePlace(c, { name: parsed.name!, address: parsed.address }));
        match = candidates.find((c) => !zip || c.zip === zip) ?? (candidates.length === 1 ? candidates[0] : null);
      }
      return { ...parsed, match, shortLinkOnly };
    },

    // ----- imports -----
    licenseImportPreview(candidates: LicenseCandidate[]) {
      const d = diffLicenseImport(existingLicenses(), candidates);
      return { added: d.added.length, unchanged: d.unchanged.length, missing: d.missing.length, returned: d.returned.length };
    },

    async applyLicenseImport(candidates: LicenseCandidate[], onProgress?: (done: number, total: number) => void) {
      const d = diffLicenseImport(existingLicenses(), candidates);
      const byKey = new Map(state.cafes.filter((c) => c.licenseKey).map((c) => [c.licenseKey!, c]));
      const jobs: [string, Partial<Cafe>][] = [
        ...d.added.map((c) => [licenseCafeId(c.licenseKey), { ...cafeFromLicense(c), createdAt: new Date().toISOString() }] as [string, Partial<Cafe>]),
        ...d.missing.map((k) => [byKey.get(k)!.id, { mayHaveClosed: true }] as [string, Partial<Cafe>]),
        ...d.returned.map((k) => [byKey.get(k)!.id, { mayHaveClosed: false }] as [string, Partial<Cafe>]),
      ];
      let done = 0;
      for (const [id, patch] of jobs) {
        await saveCafe(id, patch);
        onProgress?.(++done, jobs.length);
      }
      return { added: d.added.length, unchanged: d.unchanged.length, missing: d.missing.length, returned: d.returned.length };
    },

    async importSimple(
      rows: { name: string; address?: string | null; zip?: string | null; lat?: number | null; lng?: number | null; phone?: string | null; category?: Category; note?: string | null }[],
      source: Source,
      onProgress?: (done: number, total: number) => void,
    ) {
      let added = 0;
      let skipped = 0;
      for (const r of rows) {
        const res = await api.createCafe({ name: r.name, address: r.address, zip: r.zip, lat: r.lat, lng: r.lng, notes: r.note, category: r.category, source });
        if (res.duplicate) skipped++;
        else added++;
        onProgress?.(added + skipped, rows.length);
      }
      return { added, skipped };
    },

    // ----- settings, route, backup -----
    async saveSettings(patch: Partial<Settings>) {
      const next = { ...state.settings, ...patch };
      meta = { ...meta, settings: next };
      rebuild();
      await backend.writeMeta("settings", next);
    },

    async saveRoute(route: RouteState | null) {
      meta = { ...meta, route };
      rebuild();
      await backend.writeMeta("route", route as Record<string, unknown> | null);
    },

    async exportBackup(): Promise<string> {
      const photos = await backend.allPhotos();
      return JSON.stringify({ app: "cafejobfinder3000", version: 2, exportedAt: new Date().toISOString(), cafes: Object.fromEntries(docs), meta, photos });
    },

    async restoreBackup(json: string, onProgress?: (done: number, total: number) => void) {
      const data = JSON.parse(json) as { app?: string; version?: number; cafes?: Record<string, CafeDoc>; meta?: Meta; photos?: Photo[] };
      if (data.app !== "cafejobfinder3000" || data.version !== 2 || !data.cafes) throw new Error("That isn't a backup from this app");
      const incoming = new Map(Object.entries(data.cafes));
      const toDelete = [...docs.keys()].filter((id) => !incoming.has(id));
      const total = incoming.size + toDelete.length + (data.photos?.length ?? 0);
      let done = 0;
      docs = incoming;
      rebuild();
      for (const id of toDelete) {
        await backend.writeCafe(id, null);
        onProgress?.(++done, total);
      }
      for (const [id, doc] of incoming) {
        await backend.writeCafe(id, doc);
        onProgress?.(++done, total);
      }
      for (const p of data.photos ?? []) {
        await backend.writePhoto(p);
        onProgress?.(++done, total);
      }
      if (data.meta?.settings) await api.saveSettings(data.meta.settings);
      return { cafes: incoming.size };
    },
  };

  function existingLicenses() {
    return state.cafes.filter((c) => c.licenseKey).map((c) => ({ licenseKey: c.licenseKey!, mayHaveClosed: c.mayHaveClosed }));
  }

  return api;
}

function stripNulls<T extends object>(o: T): Partial<T> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v != null)) as Partial<T>;
}

export type Store = ReturnType<typeof createStore>;

// ----- derived views -----

export function todayView(cafes: Cafe[], now: Date) {
  const visible = cafes.filter((c) => !c.hidden);
  const due = visible
    .filter((c) => OPEN_STAGES.has(c.stage) && isDue(c.nextActionAt, now))
    .sort((a, b) => (a.nextActionAt ?? "").localeCompare(b.nextActionAt ?? ""));
  const trials = visible.filter((c) => c.stage === "trial" && c.nextActionAt).sort((a, b) => a.nextActionAt!.localeCompare(b.nextActionAt!));
  const toVisit = visible
    .filter((c) => c.stage === "to_visit" && !c.nextActionAt)
    .sort((a, b) => b.interest - a.interest || a.name.localeCompare(b.name))
    .slice(0, 8);
  const weekStart = startOfWeek(now).toISOString();
  const weekCount = cafes.filter((c) => c.log.some((e) => e.at >= weekStart && OUTREACH_TYPES.has(e.type))).length;
  const recent = cafes
    .flatMap((c) => c.log.map((e) => ({ ...e, cafeId: c.id, cafeName: c.name })))
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 5);
  const upcoming = visible
    .filter((c) => OPEN_STAGES.has(c.stage) && c.nextActionAt && c.nextActionAt > endOfDay(now).toISOString() && c.nextActionAt <= addDays(now, 7).toISOString())
    .sort((a, b) => a.nextActionAt!.localeCompare(b.nextActionAt!));
  return {
    due,
    trials,
    toVisit,
    upcoming,
    weekCount,
    recent,
    total: cafes.length,
    active: cafes.filter((c) => c.stage === "applied" || c.stage === "following_up" || c.stage === "trial").length,
  };
}
