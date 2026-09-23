"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import CafeRow from "@/components/CafeRow";
import Map, { type MapPoint } from "@/components/Map";
import { EmptyState, PageHeader } from "@/components/ui";
import { CATEGORIES, STAGES, type Category, type Stage } from "@/db/schema";
import { useMyLocation } from "@/lib/client/useMyLocation";
import { isNewOpening } from "@/lib/dates";
import { CATEGORY_LABEL, CATEGORY_ORDER, STAGE_COLOR, STAGE_LABEL } from "@/lib/labels";
import { priorityScore } from "@/lib/priority";
import { haversine, type LatLng } from "@/lib/route/geo";
import type { CafeLite } from "@/lib/server/queries";

type Sort = "best" | "near" | "az" | "next" | "new";
type StageFilter = "active" | "all" | Stage;
type Prefs = { view: "list" | "map"; categories: Category[]; stage: StageFilter; sort: Sort; hideChains: boolean; showHidden: boolean };

const DEFAULT_PREFS: Prefs = { view: "list", categories: [...CATEGORIES], stage: "active", sort: "best", hideChains: false, showHidden: false };
const PREFS_KEY = "cjf.cafes.prefs";
const PAGE = 60;

function loadPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    return raw ? { ...DEFAULT_PREFS, ...(JSON.parse(raw) as Partial<Prefs>) } : DEFAULT_PREFS;
  } catch {
    return DEFAULT_PREFS;
  }
}

export default function CafeBrowser({ cafes, home }: { cafes: CafeLite[]; home: LatLng | null }) {
  // Rendered only in the browser (see CafeBrowserLoader), so reading saved prefs here is safe.
  const [prefs, setPrefs] = useState<Prefs>(loadPrefs);
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(PAGE);
  const { location, locate, status } = useMyLocation();
  const [now] = useState(() => new Date());

  const update = (patch: Partial<Prefs>) => {
    setPrefs((p) => {
      const next = { ...p, ...patch };
      try {
        localStorage.setItem(PREFS_KEY, JSON.stringify(next));
      } catch {
        /* private mode */
      }
      return next;
    });
    setLimit(PAGE);
  };

  const origin = location ?? home;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const cats = new Set(prefs.categories);
    const rows = cafes.filter((c) => {
      if (!prefs.showHidden && c.hidden) return false;
      if (!cats.has(c.category)) return false;
      if (prefs.hideChains && c.isChain) return false;
      if (prefs.stage === "active" && (c.stage === "closed" || c.stage === "offer")) return false;
      if (prefs.stage !== "active" && prefs.stage !== "all" && c.stage !== prefs.stage) return false;
      if (q && !`${c.name} ${c.address ?? ""} ${c.zip ?? ""}`.toLowerCase().includes(q)) return false;
      return true;
    });
    const dist = (c: CafeLite) => (origin && c.lat != null && c.lng != null ? haversine(origin, { lat: c.lat, lng: c.lng }) : Infinity);
    const withDist = rows.map((c) => ({ c, d: dist(c), p: priorityScore(c, now) }));
    withDist.sort((a, b) => {
      switch (prefs.sort) {
        case "near":
          return a.d - b.d;
        case "az":
          return a.c.name.localeCompare(b.c.name);
        case "next":
          return (a.c.nextActionAt ?? "9999").localeCompare(b.c.nextActionAt ?? "9999");
        case "new":
          return (b.c.licenseStartDate ?? "").localeCompare(a.c.licenseStartDate ?? "");
        default:
          return b.p - a.p || CATEGORY_ORDER[a.c.category] - CATEGORY_ORDER[b.c.category] || a.d - b.d;
      }
    });
    return withDist;
  }, [cafes, prefs, query, origin, now]);

  const points: MapPoint[] = useMemo(
    () =>
      filtered
        .filter(({ c }) => c.lat != null && c.lng != null)
        .map(({ c }) => ({
          id: c.id,
          lat: c.lat!,
          lng: c.lng!,
          title: c.name,
          subtitle: `${STAGE_LABEL[c.stage]}${c.address ? ` · ${c.address}` : ""}`,
          color: c.hiringSign ? "#059669" : isNewOpening(c.licenseStartDate, now) && c.stage === "discovered" ? "#c026d3" : STAGE_COLOR[c.stage].hex,
          approximate: c.pinQuality !== "exact",
          href: `/cafes/${c.id}`,
        })),
    [filtered, now],
  );

  if (!cafes.length) {
    return (
      <>
        <PageHeader title="Cafes" />
        <EmptyState title="No cafes yet" href="/" cta="Load Seattle cafes">
          Load the Seattle list from the Today tab, or add one from Google Maps.
        </EmptyState>
      </>
    );
  }

  const toggleCategory = (cat: Category) => {
    const set = new Set(prefs.categories);
    if (set.has(cat)) set.delete(cat);
    else set.add(cat);
    update({ categories: CATEGORIES.filter((c) => set.has(c)) });
  };

  return (
    <>
      <PageHeader
        title="Cafes"
        subtitle={`${filtered.length} of ${cafes.length}`}
        action={
          <div className="flex rounded-xl border border-line bg-card p-0.5 text-sm font-semibold" role="tablist">
            {(["list", "map"] as const).map((v) => (
              <button key={v} role="tab" aria-selected={prefs.view === v} onClick={() => update({ view: v })} className={`rounded-lg px-3 py-1.5 ${prefs.view === v ? "bg-accent text-accent-ink" : "text-muted"}`}>
                {v === "list" ? "List" : "Map"}
              </button>
            ))}
          </div>
        }
      />

      <input className="input mb-3" type="search" placeholder="Search name, street or ZIP" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search cafes" />

      <div className="-mx-4 mb-2 flex gap-1.5 overflow-x-auto px-4 pb-1">
        {CATEGORIES.map((cat) => (
          <button
            key={cat}
            onClick={() => toggleCategory(cat)}
            aria-pressed={prefs.categories.includes(cat)}
            className={`chip shrink-0 border py-1.5 text-sm ${prefs.categories.includes(cat) ? "border-accent bg-accent-soft text-ink" : "border-line text-muted line-through"}`}
          >
            {CATEGORY_LABEL[cat]}
          </button>
        ))}
      </div>

      <div className="mb-3 grid grid-cols-2 gap-2">
        <select className="input text-sm" value={prefs.stage} onChange={(e) => update({ stage: e.target.value as StageFilter })} aria-label="Stage filter">
          <option value="active">All open stages</option>
          <option value="all">Everything</option>
          {STAGES.map((s) => (
            <option key={s} value={s}>
              {STAGE_LABEL[s]}
            </option>
          ))}
        </select>
        <select
          className="input text-sm"
          value={prefs.sort}
          onChange={(e) => {
            const sort = e.target.value as Sort;
            update({ sort });
            if (sort === "near" && !origin) locate();
          }}
          aria-label="Sort"
        >
          <option value="best">Best first</option>
          <option value="near">Nearest</option>
          <option value="next">Next action</option>
          <option value="new">Newest license</option>
          <option value="az">A–Z</option>
        </select>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={prefs.hideChains} onChange={(e) => update({ hideChains: e.target.checked })} /> Hide chains
        </label>
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={prefs.showHidden} onChange={(e) => update({ showHidden: e.target.checked })} /> Show hidden
        </label>
        {!location && (
          <button className="font-semibold text-accent" onClick={() => locate()}>
            {status === "locating" ? "Locating…" : "📍 Use my location"}
          </button>
        )}
      </div>

      {prefs.view === "map" ? (
        <Map points={points} you={location} height={520} />
      ) : filtered.length ? (
        <div className="space-y-2">
          {filtered.slice(0, limit).map(({ c, d }) => (
            <CafeRow key={c.id} cafe={c} now={now} distanceM={Number.isFinite(d) ? d : null} />
          ))}
          {filtered.length > limit && (
            <button className="btn-ghost w-full" onClick={() => setLimit((l) => l + PAGE)}>
              Show more ({filtered.length - limit} left)
            </button>
          )}
        </div>
      ) : (
        <EmptyState title="Nothing matches">Try turning a category back on or clearing the search.</EmptyState>
      )}

      <p className="mt-4 text-center text-xs text-muted">
        Missing somewhere? <Link href="/add" className="font-semibold text-accent underline">Add it</Link>
      </p>
    </>
  );
}
