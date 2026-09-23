import { useMemo, useState } from "react";
import { EmptyState, PageHeader } from "../components/ui";
import { NavButton } from "../router";
import { useAppState, useStoreApi } from "../useStore";
import QuickLog from "./cafe/QuickLog";
import type { RouteState } from "@/store/backend";
import type { Cafe } from "@/lib/types";
import { isVisitable, priorityScore } from "@/lib/priority";
import { areaLabel, neighborhoodName } from "@/lib/neighborhoods";
import { zipCentroid } from "@/lib/geocode/zipCentroid";
import { formatClock, ROUTE_MODE_LABEL, type RouteMode } from "@/lib/route/plan";
import { formatDistance, formatMinutes } from "@/lib/route/geo";
import { directionsUrl, planAreaRoute, type AreaStep, type AreaStopInput } from "@/lib/route/areaPlan";

function nextHalfHour(): string {
  const d = new Date(Date.now() + 15 * 60_000);
  d.setMinutes(d.getMinutes() < 30 ? 30 : 60, 0, 0);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
const timeFmt = (d: Date) => d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
const toStop = (c: Cafe): AreaStopInput => ({ id: c.id, name: c.name, address: c.address, zip: c.zip, lat: c.lat, lng: c.lng, exact: c.pinQuality === "exact", googleMapsUrl: c.googleMapsUrl });

export default function Route() {
  const { cafes, byId, settings, route } = useAppState();
  const store = useStoreApi();
  const [now] = useState(() => new Date());
  const r: RouteState = route ?? { mode: "park_walk", stopIds: [], doneIds: [], startZip: settings.homeZip, departAt: nextHalfHour(), active: false };
  const save = (patch: Partial<RouteState>) => store.saveRoute({ ...r, ...patch });

  const [areas, setAreas] = useState<string[]>(() => (settings.homeZip ? [settings.homeZip] : []));
  const [maxStops, setMaxStops] = useState(6);
  const [picker, setPicker] = useState(false);
  const [query, setQuery] = useState("");

  const visitable = useMemo(() => cafes.filter((c) => isVisitable(c, now)), [cafes, now]);
  const areaCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of visitable) if (c.zip) m.set(c.zip, (m.get(c.zip) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [visitable]);

  const pick = () => {
    const pool = visitable.filter((c) => !areas.length || (c.zip && areas.includes(c.zip)));
    const chosen = pool
      .map((c) => ({ c, p: priorityScore(c, now) }))
      .sort((a, b) => b.p - a.p || a.c.name.localeCompare(b.c.name))
      .slice(0, maxStops)
      .map(({ c }) => c.id);
    save({ stopIds: chosen, doneIds: [], active: false });
  };

  const plan = useMemo(() => {
    const stops = r.stopIds.map((id) => byId.get(id)).filter((c): c is Cafe => !!c).map(toStop);
    if (!stops.length) return null;
    const [h, m] = r.departAt.split(":").map(Number);
    const depart = new Date();
    depart.setHours(h, m, 0, 0);
    return planAreaRoute({ stops, mode: r.mode, start: zipCentroid(r.startZip), departAt: depart, dwellMinutes: settings.dwellMinutes, window: { start: settings.windowStart, end: settings.windowEnd } });
  }, [r.stopIds, r.mode, r.departAt, r.startZip, byId, settings.dwellMinutes, settings.windowStart, settings.windowEnd]);

  if (!cafes.length) return <EmptyState title="No cafes yet" />;

  const candidates = visitable
    .filter((c) => !r.stopIds.includes(c.id))
    .filter((c) => (query ? `${c.name} ${c.address ?? ""}`.toLowerCase().includes(query.toLowerCase()) : !areas.length || (c.zip && areas.includes(c.zip))))
    .sort((a, b) => priorityScore(b, now) - priorityScore(a, now))
    .slice(0, 40);

  return (
    <>
      <PageHeader title="Walk-in day" subtitle={`Best time to walk in: ${formatClock(settings.windowStart)}–${formatClock(settings.windowEnd)}, after the lunch rush`} />

      {/* While out walking in, keep the stops on top and tuck the planning controls away. */}
      <section className="card mb-4 space-y-3 p-4" hidden={r.active && !!plan}>
        <div className="grid grid-cols-3 rounded-xl border border-line p-0.5 text-sm font-semibold" role="radiogroup" aria-label="Travel mode">
          {(Object.keys(ROUTE_MODE_LABEL) as RouteMode[]).map((m) => (
            <button key={m} type="button" role="radio" aria-checked={r.mode === m} onClick={() => save({ mode: m })} className={`rounded-lg py-2 ${r.mode === m ? "bg-accent text-accent-ink" : "text-muted"}`}>
              {m === "walk" ? "🚶 " : m === "drive" ? "🚗 " : "🚗+🚶 "}
              {ROUTE_MODE_LABEL[m]}
            </button>
          ))}
        </div>
        <p className="text-xs text-muted">
          {r.mode === "park_walk" && "Drive to each neighborhood, park once, and walk to the cafes there."}
          {r.mode === "walk" && "Best with one neighborhood — pick where you'll be."}
          {r.mode === "drive" && "Drive to each cafe."}
        </p>

        <div>
          <span className="label">Where today?</span>
          <div className="-mx-1 flex max-h-40 flex-wrap gap-1.5 overflow-y-auto px-1">
            {areaCounts.map(([z, n]) => {
              const on = areas.includes(z);
              return (
                <button
                  key={z}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setAreas((xs) => (on ? xs.filter((x) => x !== z) : [...xs, z]))}
                  className={`chip border py-1.5 text-sm ${on ? "border-accent bg-accent-soft text-ink" : "border-line text-muted"}`}
                >
                  {neighborhoodName(z)} <span className="opacity-60">{n}</span>
                </button>
              );
            })}
          </div>
          <p className="mt-1 text-xs text-muted">{areas.length ? `${areas.length} picked` : "None picked = anywhere in Seattle"}</p>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <label>
            <span className="label">Starting from</span>
            <select id="route-start" className="input text-sm" value={r.startZip ?? ""} onChange={(e) => save({ startZip: e.target.value || null })}>
              <option value="">First stop</option>
              {areaCounts.map(([z]) => (
                <option key={z} value={z}>
                  {areaLabel(z)}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="label">Leave at</span>
            <input id="route-time" type="time" className="input text-sm" value={r.departAt} onChange={(e) => save({ departAt: e.target.value })} />
          </label>
        </div>
        <div className="flex items-end gap-2">
          <label className="w-24">
            <span className="label">Stops</span>
            <input id="route-stops" type="number" min={1} max={15} className="input text-sm" value={maxStops} onChange={(e) => setMaxStops(Math.max(1, Math.min(15, Number(e.target.value) || 1)))} />
          </label>
          <button type="button" className="btn-primary flex-1" onClick={pick}>
            ✨ Pick the best stops
          </button>
        </div>
      </section>

      {plan && (
        <>
          <p className="mb-3 text-sm text-muted">
            {r.stopIds.length} stops in {plan.areas} {plan.areas === 1 ? "neighborhood" : "neighborhoods"} · about {formatMinutes(plan.totalMinutes)} · done around {timeFmt(plan.finish)}
          </p>
          {plan.walkWarning && (
            <p className="card mb-3 border-amber-300 p-3 text-sm">These neighborhoods are far apart on foot. Switch to 🚗+🚶 Drive + walk, or pick one neighborhood.</p>
          )}
          <div className="mb-3 flex gap-2">
            <button type="button" className="btn-primary flex-1" onClick={() => save({ active: !r.active })}>
              {r.active ? "Show planning view" : "▶ Start the day"}
            </button>
            <button type="button" className="btn-ghost" onClick={() => save({ stopIds: [], doneIds: [], active: false })}>
              Clear
            </button>
          </div>
          <ol className="space-y-2">
            {plan.steps.map((s, i) => (
              <StepCard
                key={i}
                step={s}
                mode={r.mode}
                active={r.active}
                done={s.kind === "stop" && r.doneIds.includes(s.stop.id)}
                cafe={s.kind === "stop" ? byId.get(s.stop.id) : undefined}
                onRemove={() => s.kind === "stop" && save({ stopIds: r.stopIds.filter((x) => x !== s.stop.id) })}
                onDone={() => s.kind === "stop" && save({ doneIds: [...new Set([...r.doneIds, s.stop.id])] })}
              />
            ))}
          </ol>
          <p className="mt-3 text-xs text-muted">Times are estimates. “Navigate” opens Google Maps for exact directions.</p>
        </>
      )}

      <section className="mt-4">
        <button type="button" className="btn-ghost w-full" onClick={() => setPicker((p) => !p)}>
          {picker ? "Done adding" : "＋ Add stops by hand"}
        </button>
        {picker && (
          <div className="mt-2 space-y-2">
            <input id="route-search" className="input" type="search" placeholder="Search all cafes" value={query} onChange={(e) => setQuery(e.target.value)} />
            <ul className="card divide-y divide-line">
              {candidates.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{c.name}</span>
                    <span className="block truncate text-xs text-muted">
                      {c.address} · {neighborhoodName(c.zip)}
                    </span>
                  </span>
                  <button type="button" className="btn-soft min-h-9 px-3" onClick={() => save({ stopIds: [...r.stopIds, c.id] })}>
                    Add
                  </button>
                </li>
              ))}
              {!candidates.length && <li className="px-3 py-3 text-sm text-muted">No matches.</li>}
            </ul>
          </div>
        )}
      </section>
    </>
  );
}

function legText(step: AreaStep) {
  const leg = step.leg;
  if (!leg) return null;
  const icon = leg.mode === "walk" ? "🚶" : "🚗";
  return `${icon} ${leg.guess ? "~" : ""}${formatMinutes(leg.minutes)}${leg.meters != null ? ` · ${formatDistance(leg.meters)}` : ""}`;
}

function StepCard({
  step,
  mode,
  active,
  done,
  cafe,
  onRemove,
  onDone,
}: {
  step: AreaStep;
  mode: RouteMode;
  active: boolean;
  done: boolean;
  cafe?: Cafe;
  onRemove: () => void;
  onDone: () => void;
}) {
  if (step.kind === "area") {
    return (
      <li className="pt-2">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-bold tracking-wide text-muted uppercase">{step.name}</p>
            {step.parkAt && (
              <p className="text-xs text-muted">
                🅿️ Drive {step.leg ? `(${legText(step)?.replace("🚗 ", "")})` : ""}, park near {step.parkAt.name}, then walk to {step.stops} cafes
              </p>
            )}
          </div>
          {step.parkAt && (
            <a className="btn-soft min-h-9 shrink-0 px-3" href={directionsUrl(step.parkAt, "drive")} target="_blank" rel="noreferrer">
              Drive there
            </a>
          )}
        </div>
      </li>
    );
  }
  const legMode = step.leg?.mode ?? (mode === "walk" ? "walk" : mode === "drive" ? "drive" : "walk");
  return (
    <li className={`card p-3 ${done ? "opacity-60" : ""}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold">
            <span className="mr-1.5 inline-flex h-6 w-6 items-center justify-center rounded-full bg-accent text-xs text-accent-ink">{done ? "✓" : step.index}</span>
            <NavButton to={{ name: "cafe", id: step.stop.id }} className="text-left underline-offset-2 hover:underline">
              {step.stop.name}
            </NavButton>
          </p>
          <p className="mt-0.5 text-xs text-muted">
            {legText(step) ? `${legText(step)} · ` : ""}arrive ~{timeFmt(step.arrive)}
            {step.outsideWindow && <span className="text-amber-700 dark:text-amber-400"> · outside walk-in window</span>}
          </p>
          {step.stop.address && <p className="text-xs text-muted">{step.stop.address}</p>}
          {cafe?.bestTimeNote && <p className="text-xs text-muted">Best time: {cafe.bestTimeNote}</p>}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <a className="btn-soft min-h-9 px-3" href={directionsUrl(step.stop, legMode)} target="_blank" rel="noreferrer">
            Navigate
          </a>
          {!active && (
            <button type="button" className="text-xs text-muted" onClick={onRemove}>
              Remove
            </button>
          )}
        </div>
      </div>
      {active && !done && cafe && (
        <div className="mt-3 border-t border-line pt-3">
          <QuickLog cafeId={cafe.id} stage={cafe.stage} compact onDone={onDone} />
          <button type="button" className="mt-2 text-xs text-muted" onClick={onDone}>
            Skip this one
          </button>
        </div>
      )}
    </li>
  );
}
