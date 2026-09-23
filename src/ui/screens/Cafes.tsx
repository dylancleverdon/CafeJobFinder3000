import { useMemo, useState } from "react";
import CafeRow from "../components/CafeRow";
import { EmptyState, PageHeader } from "../components/ui";
import { NavButton } from "../router";
import { useAppState } from "../useStore";
import { CATEGORIES, STAGES, type Cafe, type Category, type Stage } from "@/lib/types";
import { CATEGORY_LABEL, CATEGORY_ORDER, STAGE_LABEL } from "@/lib/labels";
import { priorityScore } from "@/lib/priority";
import { areaLabel } from "@/lib/neighborhoods";
import { haversine } from "@/lib/route/geo";
import { zipCentroid } from "@/lib/geocode/zipCentroid";

type Sort = "best" | "area" | "near" | "next" | "new" | "az";
type StageFilter = "active" | "all" | Stage;
type Prefs = { categories: Category[]; stage: StageFilter; sort: Sort; hideChains: boolean; showHidden: boolean; zip: string };

const DEFAULT_PREFS: Prefs = { categories: [...CATEGORIES], stage: "active", sort: "best", hideChains: false, showHidden: false, zip: "" };
const PREFS_KEY = "cjf.cafes.prefs";
const PAGE = 50;

function loadPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    return raw ? { ...DEFAULT_PREFS, ...(JSON.parse(raw) as Partial<Prefs>) } : DEFAULT_PREFS;
  } catch {
    return DEFAULT_PREFS;
  }
}

export default function Cafes() {
  const { cafes, settings } = useAppState();
  const [prefs, setPrefs] = useState<Prefs>(loadPrefs);
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(PAGE);
  const [now] = useState(() => new Date());
  const home = zipCentroid(settings.homeZip);

  const update = (patch: Partial<Prefs>) => {
    setPrefs((p) => {
      const next = { ...p, ...patch };
      try {
        localStorage.setItem(PREFS_KEY, JSON.stringify(next));
      } catch {
        /* not saved — fine */
      }
      return next;
    });
    setLimit(PAGE);
  };

  const zips = useMemo(() => {
    const counts = new Map<string, number>();
    for (const c of cafes) if (c.zip) counts.set(c.zip, (counts.get(c.zip) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [cafes]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const cats = new Set(prefs.categories);
    const rows = cafes.filter((c) => {
      if (!prefs.showHidden && c.hidden) return false;
      if (!cats.has(c.category)) return false;
      if (prefs.hideChains && c.isChain) return false;
      if (prefs.zip && c.zip !== prefs.zip) return false;
      if (prefs.stage === "active" && (c.stage === "closed" || c.stage === "offer")) return false;
      if (prefs.stage !== "active" && prefs.stage !== "all" && c.stage !== prefs.stage) return false;
      if (q && !`${c.name} ${c.address ?? ""} ${c.zip ?? ""}`.toLowerCase().includes(q)) return false;
      return true;
    });
    const dist = (c: Cafe) => (home && c.lat != null && c.lng != null ? haversine(home, { lat: c.lat, lng: c.lng }) : Infinity);
    const scored = rows.map((c) => ({ c, p: priorityScore(c, now), d: dist(c) }));
    scored.sort((a, b) => {
      switch (prefs.sort) {
        case "area":
          return (a.c.zip ?? "").localeCompare(b.c.zip ?? "") || a.c.name.localeCompare(b.c.name);
        case "near":
          return a.d - b.d || b.p - a.p;
        case "az":
          return a.c.name.localeCompare(b.c.name);
        case "next":
          return (a.c.nextActionAt ?? "9999").localeCompare(b.c.nextActionAt ?? "9999");
        case "new":
          return (b.c.licenseStartDate ?? "").localeCompare(a.c.licenseStartDate ?? "");
        default:
          return b.p - a.p || CATEGORY_ORDER[a.c.category] - CATEGORY_ORDER[b.c.category] || a.c.name.localeCompare(b.c.name);
      }
    });
    return scored.map((s) => s.c);
  }, [cafes, prefs, query, now, home]);

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
          <NavButton to={{ name: "add" }} className="btn-soft min-h-9 px-3">
            ＋ Add
          </NavButton>
        }
      />

      <input id="cafe-search" className="input mb-3" type="search" placeholder="Search name, street or ZIP" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search cafes" />

      <div className="-mx-4 mb-2 flex gap-1.5 overflow-x-auto px-4 pb-1">
        {CATEGORIES.map((cat) => (
          <button
            key={cat}
            type="button"
            onClick={() => toggleCategory(cat)}
            aria-pressed={prefs.categories.includes(cat)}
            className={`chip shrink-0 border py-1.5 text-sm ${prefs.categories.includes(cat) ? "border-accent bg-accent-soft text-ink" : "border-line text-muted line-through"}`}
          >
            {CATEGORY_LABEL[cat]}
          </button>
        ))}
      </div>

      <div className="mb-2 grid grid-cols-2 gap-2">
        <select id="stage-filter" className="input text-sm" value={prefs.stage} onChange={(e) => update({ stage: e.target.value as StageFilter })} aria-label="Stage filter">
          <option value="active">All open stages</option>
          <option value="all">Everything</option>
          {STAGES.map((s) => (
            <option key={s} value={s}>
              {STAGE_LABEL[s]}
            </option>
          ))}
        </select>
        <select id="sort" className="input text-sm" value={prefs.sort} onChange={(e) => update({ sort: e.target.value as Sort })} aria-label="Sort">
          <option value="best">Best first</option>
          <option value="area">By neighborhood</option>
          <option value="near" disabled={!home}>
            Closest to home{home ? "" : " (set home in More)"}
          </option>
          <option value="next">Next step date</option>
          <option value="new">Newest license</option>
          <option value="az">A–Z</option>
        </select>
      </div>
      <select id="area-filter" className="input mb-2 text-sm" value={prefs.zip} onChange={(e) => update({ zip: e.target.value })} aria-label="Neighborhood">
        <option value="">All neighborhoods</option>
        {zips.map(([z, n]) => (
          <option key={z} value={z}>
            {areaLabel(z)} ({n})
          </option>
        ))}
      </select>

      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
        <label className="flex items-center gap-1.5">
          <input id="hide-chains" type="checkbox" checked={prefs.hideChains} onChange={(e) => update({ hideChains: e.target.checked })} /> Hide chains
        </label>
        <label className="flex items-center gap-1.5">
          <input id="show-hidden" type="checkbox" checked={prefs.showHidden} onChange={(e) => update({ showHidden: e.target.checked })} /> Show hidden
        </label>
      </div>

      {filtered.length ? (
        <div className="space-y-2">
          {filtered.slice(0, limit).map((c) => (
            <CafeRow key={c.id} cafe={c} now={now} showArea={!prefs.zip} />
          ))}
          {filtered.length > limit && (
            <button type="button" className="btn-ghost w-full" onClick={() => setLimit((l) => l + PAGE)}>
              Show more ({filtered.length - limit} left)
            </button>
          )}
        </div>
      ) : (
        <EmptyState title="Nothing matches">Try turning a category back on, picking another neighborhood, or clearing the search.</EmptyState>
      )}
    </>
  );
}
