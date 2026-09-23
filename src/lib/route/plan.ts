import { centroid, haversine, type LatLng } from "./geo";
import { orderStops } from "./optimize";
import { travel, type TravelMode } from "./travel";

export type RouteMode = "walk" | "drive" | "park_walk";

export const ROUTE_MODE_LABEL: Record<RouteMode, string> = {
  walk: "Walk",
  drive: "Drive",
  park_walk: "Drive + walk",
};

export type StopInput = LatLng & { id: number; name: string; approximate?: boolean };

type Leg = { mode: TravelMode; meters: number; minutes: number };

export type PlanStep =
  | ({ kind: "park"; point: LatLng; group: number; groupSize: number; arrive: Date } & Leg)
  | ({ kind: "stop"; stop: StopInput; group: number; arrive: Date; depart: Date; outsideWindow: boolean } & Leg)
  | ({ kind: "back_to_car"; point: LatLng; group: number; arrive: Date } & Leg);

export type RoutePlan = {
  mode: RouteMode;
  steps: PlanStep[];
  walkMeters: number;
  driveMeters: number;
  totalMinutes: number;
  finish: Date;
};

export type PlanOptions = {
  start: LatLng;
  stops: StopInput[];
  mode: RouteMode;
  departAt: Date;
  dwellMinutes: number;
  window?: { start: string; end: string }; // "HH:MM" local time
  groupRadiusM?: number;
};

export const GROUP_RADIUS_M = 600;

/** Groups stops so that any two stops in a group are chained by <= radius hops (single linkage). */
export function groupByWalkingDistance<T extends LatLng>(points: T[], radiusM = GROUP_RADIUS_M): T[][] {
  const parent = points.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      if (haversine(points[i], points[j]) <= radiusM) parent[find(i)] = find(j);
    }
  }
  const groups = new Map<number, T[]>();
  points.forEach((p, i) => {
    const root = find(i);
    groups.set(root, [...(groups.get(root) ?? []), p]);
  });
  return [...groups.values()];
}

function minutesOfDay(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + (m || 0);
}

/** "14:00" → "2 PM", "14:30" → "2:30 PM" */
export function formatClock(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const suffix = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 || 12;
  return m ? `${h12}:${String(m).padStart(2, "0")} ${suffix}` : `${h12} ${suffix}`;
}

export function isOutsideWindow(at: Date, window?: { start: string; end: string }): boolean {
  if (!window) return false;
  const t = at.getHours() * 60 + at.getMinutes();
  return t < minutesOfDay(window.start) || t > minutesOfDay(window.end);
}

const addMin = (d: Date, min: number) => new Date(d.getTime() + min * 60_000);

function orderByTravel(start: LatLng, points: LatLng[], mode: TravelMode, returnToStart: boolean): number[] {
  const nodes = [start, ...points];
  const cost = (i: number, j: number) => travel(nodes[i], nodes[j], mode).minutes;
  return orderStops(points.length, cost, { returnToStart }).map((k) => k - 1);
}

export function planRoute(opts: PlanOptions): RoutePlan {
  const { start, stops, mode, departAt, dwellMinutes, window } = opts;
  const steps: PlanStep[] = [];
  let clock = departAt;
  let here: LatLng = start;

  const visit = (stop: StopInput, legMode: TravelMode, group: number) => {
    const leg = travel(here, stop, legMode);
    const arrive = addMin(clock, leg.minutes);
    const depart = addMin(arrive, dwellMinutes);
    steps.push({ kind: "stop", stop, group, arrive, depart, outsideWindow: isOutsideWindow(arrive, window), mode: legMode, ...leg });
    clock = depart;
    here = stop;
  };

  if (mode === "walk" || mode === "drive") {
    const legMode: TravelMode = mode;
    orderByTravel(start, stops, legMode, false).forEach((i) => visit(stops[i], legMode, 0));
  } else {
    const groups = groupByWalkingDistance(stops, opts.groupRadiusM ?? GROUP_RADIUS_M);
    const parking = groups.map((g) => (g.length === 1 ? { lat: g[0].lat, lng: g[0].lng } : centroid(g)));
    orderByTravel(start, parking, "drive", false).forEach((gi, n) => {
      const group = groups[gi];
      if (group.length === 1) {
        // A cafe on its own: just drive (and park) there.
        visit(group[0], "drive", n);
        return;
      }
      const car = parking[gi];
      const drive = travel(here, car, "drive");
      clock = addMin(clock, drive.minutes);
      steps.push({ kind: "park", point: car, group: n, groupSize: group.length, arrive: clock, mode: "drive", ...drive });
      here = car;
      orderByTravel(car, group, "walk", true).forEach((i) => visit(group[i], "walk", n));
      const back = travel(here, car, "walk");
      clock = addMin(clock, back.minutes);
      steps.push({ kind: "back_to_car", point: car, group: n, arrive: clock, mode: "walk", ...back });
      here = car;
    });
  }

  const walkMeters = steps.filter((s) => s.mode === "walk").reduce((a, s) => a + s.meters, 0);
  const driveMeters = steps.filter((s) => s.mode === "drive").reduce((a, s) => a + s.meters, 0);
  return {
    mode,
    steps,
    walkMeters,
    driveMeters,
    totalMinutes: (clock.getTime() - departAt.getTime()) / 60_000,
    finish: clock,
  };
}

/** A plain Google Maps directions link (no API key — it just opens the Maps app). */
export function navigateUrl(to: LatLng, mode: TravelMode): string {
  const params = new URLSearchParams({
    api: "1",
    destination: `${to.lat.toFixed(6)},${to.lng.toFixed(6)}`,
    travelmode: mode === "walk" ? "walking" : "driving",
  });
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}
