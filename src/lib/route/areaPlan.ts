/**
 * Walk-in day planner that works without exact map pins.
 *
 * Most cafes only have an approximate spot (the center of their ZIP code),
 * so stops are grouped by neighborhood (ZIP): drive between neighborhoods
 * in the shortest order, and inside a neighborhood visit cafes in street
 * order. Cafes with exact pins are ordered by real distance. Google Maps
 * does the turn-by-turn part via plain directions links.
 */
import { neighborhoodName } from "../neighborhoods";
import { zipCentroid } from "../geocode/zipCentroid";
import { centroid, haversine, type LatLng } from "./geo";
import { orderStops } from "./optimize";
import { isOutsideWindow, type RouteMode } from "./plan";
import { travel, type TravelMode } from "./travel";

export type AreaStopInput = {
  id: string;
  name: string;
  address: string | null;
  zip: string | null;
  lat: number | null;
  lng: number | null;
  exact: boolean;
  googleMapsUrl?: string | null;
};

export type AreaLeg = { mode: TravelMode; minutes: number; meters: number | null; guess: boolean };

export type AreaStep =
  | { kind: "area"; zip: string | null; name: string; stops: number; leg: AreaLeg | null; parkAt: AreaStopInput | null; arrive: Date }
  | { kind: "stop"; stop: AreaStopInput; leg: AreaLeg | null; arrive: Date; outsideWindow: boolean; index: number };

export type AreaPlan = { steps: AreaStep[]; totalMinutes: number; finish: Date; areas: number; walkWarning: boolean };

/** Rough walk between two cafes in the same neighborhood when we don't know exactly where they are. */
export const GUESS_WALK_MIN = 7;
export const GUESS_DRIVE_MIN = 6; // plus parking

const streetParts = (address: string | null) => {
  const m = /^\s*(\d+)(?:[-\s]\d+\/\d+)?\s+(.*)$/.exec(address ?? "");
  return m ? { number: Number(m[1]), street: m[2].split(",")[0].replace(/\s*#.*$/, "").toUpperCase().trim() } : { number: 0, street: (address ?? "").toUpperCase() };
};

/** Same street together, in house-number order. */
export function streetOrder<T extends { address: string | null; name: string }>(stops: T[]): T[] {
  return stops
    .map((s) => ({ s, p: streetParts(s.address) }))
    .sort((a, b) => a.p.street.localeCompare(b.p.street) || a.p.number - b.p.number || a.s.name.localeCompare(b.s.name))
    .map(({ s }) => s);
}

function areaPoint(stops: AreaStopInput[]): LatLng | null {
  const exact = stops.filter((s) => s.exact && s.lat != null && s.lng != null) as (AreaStopInput & LatLng)[];
  if (exact.length) return centroid(exact);
  return zipCentroid(stops[0]?.zip) ?? null;
}

const addMin = (d: Date, m: number) => new Date(d.getTime() + m * 60_000);

export function planAreaRoute(opts: {
  stops: AreaStopInput[];
  mode: RouteMode;
  start: LatLng | null;
  departAt: Date;
  dwellMinutes: number;
  window?: { start: string; end: string };
}): AreaPlan {
  const { stops, mode, departAt, dwellMinutes, window } = opts;
  // 1) Group by neighborhood.
  const byZip = new Map<string, AreaStopInput[]>();
  for (const s of stops) {
    const k = s.zip ?? "?";
    byZip.set(k, [...(byZip.get(k) ?? []), s]);
  }
  const groups = [...byZip.entries()].map(([zip, g]) => ({ zip: zip === "?" ? null : zip, stops: g, point: areaPoint(g) }));

  // 2) Order neighborhoods by driving distance from the start.
  const located = groups.filter((g) => g.point);
  const unlocated = groups.filter((g) => !g.point);
  const start = opts.start ?? located[0]?.point ?? null;
  let orderedGroups = located;
  if (start && located.length > 1) {
    const nodes: LatLng[] = [start, ...located.map((g) => g.point!)];
    orderedGroups = orderStops(located.length, (i, j) => haversine(nodes[i], nodes[j])).map((k) => located[k - 1]);
  }
  orderedGroups = [...orderedGroups, ...unlocated];

  // 3) Order stops inside each neighborhood.
  const orderInside = (g: (typeof groups)[number], from: LatLng | null): AreaStopInput[] => {
    const allExact = g.stops.every((s) => s.exact && s.lat != null && s.lng != null);
    if (allExact && from) {
      const nodes: LatLng[] = [from, ...g.stops.map((s) => ({ lat: s.lat!, lng: s.lng! }))];
      return orderStops(g.stops.length, (i, j) => haversine(nodes[i], nodes[j])).map((k) => g.stops[k - 1]);
    }
    return streetOrder(g.stops);
  };

  const legBetween = (a: AreaStopInput | LatLng | null, b: AreaStopInput, m: TravelMode): AreaLeg | null => {
    if (!a) return null;
    const aExact = !("exact" in a) || a.exact;
    if (aExact && b.exact && a.lat != null && a.lng != null && b.lat != null && b.lng != null) {
      const t = travel({ lat: a.lat, lng: a.lng }, { lat: b.lat, lng: b.lng }, m);
      return { mode: m, minutes: t.minutes, meters: t.meters, guess: false };
    }
    return { mode: m, minutes: m === "walk" ? GUESS_WALK_MIN : GUESS_DRIVE_MIN + 5, meters: null, guess: true };
  };

  const steps: AreaStep[] = [];
  let clock = departAt;
  let here: LatLng | null = start;
  let index = 0;
  let walkWarning = false;

  const visit = (s: AreaStopInput, leg: AreaLeg | null) => {
    clock = addMin(clock, leg?.minutes ?? 0);
    steps.push({ kind: "stop", stop: s, leg, arrive: clock, outsideWindow: isOutsideWindow(clock, window), index: ++index });
    clock = addMin(clock, dwellMinutes);
  };

  orderedGroups.forEach((g, gi) => {
    const inside = orderInside(g, here ?? g.point);
    // Getting to this neighborhood.
    let arriveLeg: AreaLeg | null = null;
    if (g.point && here) {
      const legMode: TravelMode = mode === "walk" ? "walk" : "drive";
      const t = travel(here, g.point, legMode);
      arriveLeg = { mode: legMode, minutes: t.minutes, meters: t.meters, guess: true };
      if (mode === "walk" && t.meters > 2500) walkWarning = true;
    }
    if (mode === "park_walk" && inside.length > 1) {
      clock = addMin(clock, arriveLeg?.minutes ?? 0);
      steps.push({ kind: "area", zip: g.zip, name: neighborhoodName(g.zip), stops: inside.length, leg: arriveLeg, parkAt: inside[0], arrive: clock });
      inside.forEach((s, i) => visit(s, i === 0 ? null : legBetween(inside[i - 1], s, "walk")));
    } else {
      steps.push({ kind: "area", zip: g.zip, name: neighborhoodName(g.zip), stops: inside.length, leg: null, parkAt: null, arrive: clock });
      const legMode: TravelMode = mode === "walk" ? "walk" : "drive";
      inside.forEach((s, i) => visit(s, i === 0 ? (gi === 0 && !opts.start ? null : arriveLeg ?? legBetween(here, s, legMode)) : legBetween(inside[i - 1], s, legMode)));
    }
    const last = inside[inside.length - 1];
    here = last && last.exact && last.lat != null && last.lng != null ? { lat: last.lat, lng: last.lng } : g.point ?? here;
  });

  return { steps, totalMinutes: (clock.getTime() - departAt.getTime()) / 60_000, finish: clock, areas: orderedGroups.length, walkWarning };
}

/** A plain Google Maps directions link to a cafe — by exact spot when known, otherwise by name + address. */
export function directionsUrl(s: AreaStopInput, mode: TravelMode): string {
  const destination = s.exact && s.lat != null && s.lng != null ? `${s.lat.toFixed(6)},${s.lng.toFixed(6)}` : [s.name, s.address, `Seattle, WA ${s.zip ?? ""}`.trim()].filter(Boolean).join(", ");
  const params = new URLSearchParams({ api: "1", destination, travelmode: mode === "walk" ? "walking" : "driving" });
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}
