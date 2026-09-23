"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import Map, { type MapLine, type MapPoint } from "@/components/Map";
import { EmptyState, PageHeader } from "@/components/ui";
import { useMyLocation } from "@/lib/client/useMyLocation";
import { AUTO_PICK_RADIUS_M, autoPick, isVisitable, priorityScore } from "@/lib/priority";
import { formatDistance, formatMinutes, haversine, type LatLng } from "@/lib/route/geo";
import { formatClock, navigateUrl, planRoute, ROUTE_MODE_LABEL, type PlanStep, type RouteMode } from "@/lib/route/plan";
import type { CafeLite } from "@/lib/server/queries";
import QuickLog from "../cafes/[id]/QuickLog";

type StartChoice = "gps" | "home";
type Saved = { mode: RouteMode; maxStops: number; selected: number[]; done: number[]; startChoice: StartChoice; departAt: string };
const KEY = "cjf.route";

function readSaved(): Saved | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Saved) : null;
  } catch {
    return null;
  }
}

function nextHalfHour(): string {
  const d = new Date(Date.now() + 15 * 60_000);
  d.setMinutes(d.getMinutes() < 30 ? 30 : 60, 0, 0);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

const timeFmt = (d: Date) => d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

export default function RoutePlanner({
  cafes,
  home,
  window,
  dwellMinutes,
  preselected,
}: {
  cafes: CafeLite[];
  home: (LatLng & { label: string }) | null;
  window: { start: string; end: string };
  dwellMinutes: number;
  preselected: number[];
}) {
  const [now] = useState(() => new Date());
  const { location, locate, status, error } = useMyLocation();
  // Rendered only in the browser (see RoutePlannerLoader), so an in-progress
  // route saved on this phone can be restored straight into state.
  const [saved] = useState(() => (preselected.length ? null : readSaved()));
  const [mode, setMode] = useState<RouteMode>(saved?.mode ?? "park_walk");
  const [maxStops, setMaxStops] = useState(saved?.maxStops ?? 6);
  const [selected, setSelected] = useState<number[]>(saved?.selected ?? preselected);
  const [done, setDone] = useState<number[]>(saved?.done ?? []);
  const [startChoice, setStartChoice] = useState<StartChoice>(saved?.startChoice ?? (home ? "home" : "gps"));
  const [departAt, setDepartAt] = useState(saved?.departAt ?? nextHalfHour());
  const [active, setActive] = useState(!!saved?.selected.length);
  const [picker, setPicker] = useState(false);
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (startChoice === "gps") locate();
    // Only on first open; switching the start later calls locate() directly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify({ mode, maxStops, selected, done, startChoice, departAt } satisfies Saved));
    } catch {
      /* private mode */
    }
  }, [mode, maxStops, selected, done, startChoice, departAt]);

  const start: LatLng | null = startChoice === "home" && home ? home : location;
  const byId = useMemo(() => new globalThis.Map(cafes.map((c) => [c.id, c])), [cafes]);
  const pinned = cafes.filter((c) => c.lat != null && c.lng != null);
  const exactCount = cafes.filter((c) => c.pinQuality === "exact").length;

  const pick = () => {
    if (!start) return;
    const chosen = autoPick(cafes, { start, mode, maxStops, now });
    setSelected(chosen.map((c) => c.id));
    setDone([]);
    setActive(false);
  };

  const plan = useMemo(() => {
    if (!start || !selected.length) return null;
    const stops = selected
      .map((id) => byId.get(id))
      .filter((c): c is CafeLite => !!c && c.lat != null && c.lng != null)
      .map((c) => ({ id: c.id, name: c.name, lat: c.lat!, lng: c.lng!, approximate: c.pinQuality !== "exact" }));
    const [h, m] = departAt.split(":").map(Number);
    const depart = new Date();
    depart.setHours(h, m, 0, 0);
    return planRoute({ start, stops, mode, departAt: depart, dwellMinutes, window });
  }, [start, selected, byId, mode, departAt, dwellMinutes, window]);

  const points: MapPoint[] = [];
  const lines: MapLine[] = [];
  if (plan && start) {
    let prev: LatLng = start;
    let n = 0;
    for (const s of plan.steps) {
      const to = s.kind === "stop" ? s.stop : s.point;
      lines.push({ points: [prev, to], mode: s.mode });
      prev = to;
      if (s.kind === "stop") {
        n++;
        points.push({
          id: s.stop.id,
          lat: s.stop.lat,
          lng: s.stop.lng,
          title: s.stop.name,
          subtitle: `Stop ${n} · ${timeFmt(s.arrive)}`,
          color: done.includes(s.stop.id) ? "#059669" : "#6f3f22",
          approximate: s.stop.approximate,
          label: String(n),
          href: `/cafes/${s.stop.id}`,
        });
      } else if (s.kind === "park") {
        points.push({ id: `p${s.group}`, lat: s.point.lat, lng: s.point.lng, title: "Park here", color: "#2563eb", label: "P" });
      }
    }
  }

  if (!pinned.length) {
    return (
      <>
        <PageHeader title="Walk-in route" />
        <EmptyState title="No cafes on the map yet" href="/" cta="Load Seattle cafes">
          Load the Seattle list first, then come back to plan a route.
        </EmptyState>
      </>
    );
  }

  const candidates = cafes
    .filter((c) => c.lat != null && !selected.includes(c.id) && isVisitable(c, now))
    .filter((c) => !query || c.name.toLowerCase().includes(query.toLowerCase()))
    .map((c) => ({ c, d: start ? haversine(start, { lat: c.lat!, lng: c.lng! }) : 0 }))
    .sort((a, b) => priorityScore(b.c, now) - priorityScore(a.c, now) - (b.d - a.d) / 500)
    .slice(0, 40);

  return (
    <>
      <PageHeader title="Walk-in route" subtitle={`Best time to walk in: ${formatClock(window.start)}–${formatClock(window.end)}, after the lunch rush`} />

      <section className="card mb-4 space-y-3 p-4">
        <div className="grid grid-cols-3 rounded-xl border border-line p-0.5 text-sm font-semibold" role="radiogroup" aria-label="Travel mode">
          {(Object.keys(ROUTE_MODE_LABEL) as RouteMode[]).map((m) => (
            <button key={m} role="radio" aria-checked={mode === m} onClick={() => setMode(m)} className={`rounded-lg py-2 ${mode === m ? "bg-accent text-accent-ink" : "text-muted"}`}>
              {m === "walk" ? "🚶 " : m === "drive" ? "🚗 " : "🚗+🚶 "}
              {ROUTE_MODE_LABEL[m]}
            </button>
          ))}
        </div>
        <p className="text-xs text-muted">
          {mode === "park_walk" && "Drive to each neighborhood, park once, and walk to the cafes there."}
          {mode === "walk" && `Stops within about ${formatDistance(AUTO_PICK_RADIUS_M.walk)} of your start.`}
          {mode === "drive" && "Drive to each cafe (5 min added per stop to park)."}
        </p>
        <div className="grid grid-cols-2 gap-2">
          <label>
            <span className="label">Start from</span>
            <select
              className="input text-sm"
              value={startChoice}
              onChange={(e) => {
                const v = e.target.value as StartChoice;
                setStartChoice(v);
                if (v === "gps") locate();
              }}
            >
              <option value="gps">My location</option>
              {home && <option value="home">{home.label}</option>}
            </select>
          </label>
          <label>
            <span className="label">Leave at</span>
            <input type="time" className="input text-sm" value={departAt} onChange={(e) => setDepartAt(e.target.value)} />
          </label>
        </div>
        {startChoice === "gps" && status !== "ok" && (
          <p className="text-sm text-muted">
            {status === "locating" ? "Finding you…" : error ?? "Location needed."}{" "}
            {!home && (
              <Link href="/settings" className="font-semibold text-accent underline">
                Set a home spot
              </Link>
            )}
          </p>
        )}
        <div className="flex items-end gap-2">
          <label className="w-28">
            <span className="label">Stops</span>
            <input type="number" min={1} max={15} className="input text-sm" value={maxStops} onChange={(e) => setMaxStops(Math.max(1, Math.min(15, Number(e.target.value) || 1)))} />
          </label>
          <button className="btn-primary flex-1" disabled={!start || exactCount === 0} onClick={pick}>
            ✨ Pick the best stops for me
          </button>
        </div>
        {exactCount === 0 && (
          <p className="text-xs text-muted">
            Auto-pick needs exact pins. <Link className="font-semibold text-accent underline" href="/settings#pins">Get map pins</Link> first, or add stops by hand below.
          </p>
        )}
      </section>

      {plan && plan.steps.length > 0 && (
        <>
          <Map points={points} lines={lines} you={start} height={300} />
          <p className="mt-2 mb-3 text-sm text-muted">
            {selected.length} stops · about {formatMinutes(plan.totalMinutes)} · back by {timeFmt(plan.finish)}
            {plan.walkMeters > 0 && ` · 🚶 ${formatDistance(plan.walkMeters)}`}
            {plan.driveMeters > 0 && ` · 🚗 ${formatDistance(plan.driveMeters)}`}
          </p>
          <div className="mb-3 flex gap-2">
            <button className="btn-primary flex-1" onClick={() => setActive((a) => !a)}>
              {active ? "Show planning view" : "▶ Start route"}
            </button>
            <button
              className="btn-ghost"
              onClick={() => {
                setSelected([]);
                setDone([]);
                setActive(false);
              }}
            >
              Clear
            </button>
          </div>
          <ol className="space-y-2">
            {plan.steps.map((s, i) => (
              <StepCard
                key={i}
                step={s}
                index={plan.steps.slice(0, i + 1).filter((x) => x.kind === "stop").length}
                active={active}
                done={s.kind === "stop" && done.includes(s.stop.id)}
                cafe={s.kind === "stop" ? byId.get(s.stop.id) : undefined}
                onRemove={() => s.kind === "stop" && setSelected((xs) => xs.filter((x) => x !== s.stop.id))}
                onDone={() => s.kind === "stop" && setDone((xs) => [...new Set([...xs, s.stop.id])])}
              />
            ))}
          </ol>
        </>
      )}

      <section className="mt-4">
        <button className="btn-ghost w-full" onClick={() => setPicker((p) => !p)}>
          {picker ? "Done adding" : "＋ Add stops by hand"}
        </button>
        {picker && (
          <div className="mt-2 space-y-2">
            <input className="input" type="search" placeholder="Search cafes" value={query} onChange={(e) => setQuery(e.target.value)} />
            <ul className="card divide-y divide-line">
              {candidates.map(({ c, d }) => (
                <li key={c.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{c.name}</span>
                    <span className="text-xs text-muted">
                      {start ? formatDistance(d) : ""}
                      {c.pinQuality !== "exact" ? " · approx. pin" : ""}
                    </span>
                  </span>
                  <button className="btn-soft min-h-9 px-3" onClick={() => setSelected((xs) => [...xs, c.id])}>
                    Add
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </>
  );
}

function StepCard({
  step,
  index,
  active,
  done,
  cafe,
  onRemove,
  onDone,
}: {
  step: PlanStep;
  index: number;
  active: boolean;
  done: boolean;
  cafe?: CafeLite;
  onRemove: () => void;
  onDone: () => void;
}) {
  const leg = `${step.mode === "walk" ? "🚶" : "🚗"} ${formatMinutes(step.minutes)} · ${formatDistance(step.meters)}`;
  if (step.kind === "park") {
    return (
      <li className="card flex items-center justify-between gap-3 border-blue-300 p-3 dark:border-blue-900">
        <div>
          <p className="font-semibold">🅿️ Park here</p>
          <p className="text-xs text-muted">
            {leg} · then walk to {step.groupSize} {step.groupSize === 1 ? "cafe" : "cafes"} · arrive {timeFmt(step.arrive)}
          </p>
        </div>
        <a className="btn-soft shrink-0" href={navigateUrl(step.point, "drive")} target="_blank" rel="noreferrer">
          Navigate
        </a>
      </li>
    );
  }
  if (step.kind === "back_to_car") {
    return (
      <li className="px-3 text-xs text-muted">
        ↩ Walk back to the car · {leg}
      </li>
    );
  }
  return (
    <li className={`card p-3 ${done ? "opacity-60" : ""}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold">
            <span className="mr-1.5 inline-flex h-6 w-6 items-center justify-center rounded-full bg-accent text-xs text-accent-ink">{done ? "✓" : index}</span>
            <Link href={`/cafes/${step.stop.id}`} className="underline-offset-2 hover:underline">
              {step.stop.name}
            </Link>
          </p>
          <p className="mt-0.5 text-xs text-muted">
            {step.meters < 1 ? "Right there" : leg} · arrive ~{timeFmt(step.arrive)}
            {step.outsideWindow && <span className="text-amber-700 dark:text-amber-400"> · outside walk-in window</span>}
            {step.stop.approximate && <span> · approx. location</span>}
          </p>
          {cafe?.address && <p className="text-xs text-muted">{cafe.address}</p>}
        </div>
        <div className="flex shrink-0 flex-col gap-1">
          <a className="btn-soft min-h-9 px-3" href={navigateUrl(step.stop, step.mode)} target="_blank" rel="noreferrer">
            Navigate
          </a>
          {!active && (
            <button className="text-xs text-muted" onClick={onRemove}>
              Remove
            </button>
          )}
        </div>
      </div>
      {active && !done && cafe && (
        <div className="mt-3 border-t border-line pt-3">
          <QuickLog cafeId={cafe.id} stage={cafe.stage} compact onDone={onDone} />
          <button className="mt-2 text-xs text-muted" onClick={onDone}>
            Skip this one
          </button>
        </div>
      )}
    </li>
  );
}
