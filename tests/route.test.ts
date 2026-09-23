import { describe, expect, it } from "vitest";
import { haversine } from "@/lib/route/geo";
import { EXACT_LIMIT, nearestNeighbour, orderStops, pathCost, twoOpt } from "@/lib/route/optimize";
import { formatClock, groupByWalkingDistance, isOutsideWindow, navigateUrl, planRoute, type StopInput } from "@/lib/route/plan";

function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 2 ** 32;
    return seed / 2 ** 32;
  };
}

function randomPoints(n: number, seed: number) {
  const r = rng(seed);
  return Array.from({ length: n + 1 }, () => ({ lat: 47.6 + r() * 0.08, lng: -122.36 + r() * 0.08 }));
}

function permutations(xs: number[]): number[][] {
  if (xs.length <= 1) return [xs];
  return xs.flatMap((x, i) => permutations([...xs.slice(0, i), ...xs.slice(i + 1)]).map((p) => [x, ...p]));
}

describe("orderStops", () => {
  it("matches brute force for small sets (open and closed paths)", () => {
    for (let seed = 1; seed <= 12; seed++) {
      const pts = randomPoints(6, seed);
      const cost = (i: number, j: number) => haversine(pts[i], pts[j]);
      for (const returnToStart of [false, true]) {
        const best = Math.min(...permutations([1, 2, 3, 4, 5, 6]).map((p) => pathCost(p, cost, returnToStart)));
        const got = orderStops(6, cost, { returnToStart });
        expect(got.slice().sort()).toEqual([1, 2, 3, 4, 5, 6]);
        expect(pathCost(got, cost, returnToStart)).toBeCloseTo(best, 6);
      }
    }
  });

  it("2-opt is never worse than nearest-neighbour for large sets", () => {
    for (let seed = 1; seed <= 5; seed++) {
      const n = EXACT_LIMIT + 9;
      const pts = randomPoints(n, seed * 7);
      const cost = (i: number, j: number) => haversine(pts[i], pts[j]);
      const nn = nearestNeighbour(n, cost);
      const opt = twoOpt(nn, cost, false);
      expect(pathCost(opt, cost)).toBeLessThanOrEqual(pathCost(nn, cost) + 1e-6);
      expect(orderStops(n, cost).slice().sort((a, b) => a - b)).toEqual(Array.from({ length: n }, (_, i) => i + 1));
    }
  });
});

// Capitol Hill cluster + Fremont cluster + a lone Ballard stop.
const STOPS: StopInput[] = [
  { id: 1, name: "Victrola", lat: 47.61426, lng: -122.31767 },
  { id: 2, name: "Analog", lat: 47.617, lng: -122.315 },
  { id: 3, name: "Fuel Capitol Hill", lat: 47.6195, lng: -122.313 },
  { id: 4, name: "Milstead", lat: 47.64907, lng: -122.34938 },
  { id: 5, name: "Lighthouse", lat: 47.65836, lng: -122.35164 },
  { id: 6, name: "Ballard lone", lat: 47.66836, lng: -122.38464 },
];
const START = { lat: 47.6101, lng: -122.3421 }; // downtown

describe("planRoute", () => {
  it("groups stops that are a short walk apart", () => {
    const groups = groupByWalkingDistance(STOPS, 600);
    const sets = groups.map((g) => g.map((s) => s.id).sort()).sort((a, b) => a[0] - b[0]);
    expect(sets).toEqual([[1, 2, 3], [4], [5], [6]]);
    const wider = groupByWalkingDistance(STOPS, 1300);
    expect(wider.map((g) => g.map((s) => s.id).sort()).sort((a, b) => a[0] - b[0])).toEqual([[1, 2, 3], [4, 5], [6]]);
  });

  it("drive + walk: park once per group, walk the group, return to the car", () => {
    const plan = planRoute({ start: START, stops: STOPS, mode: "park_walk", departAt: new Date(2026, 8, 23, 13, 30), dwellMinutes: 10, groupRadiusM: 1300 });
    const kinds = plan.steps.map((s) => s.kind);
    expect(kinds.filter((k) => k === "park")).toHaveLength(2);
    expect(kinds.filter((k) => k === "stop")).toHaveLength(6);
    expect(kinds.filter((k) => k === "back_to_car")).toHaveLength(2);
    for (const s of plan.steps) {
      if (s.kind === "park") expect(s.mode).toBe("drive");
      else if (s.kind === "stop" && s.stop.id === 6) expect(s.mode).toBe("drive"); // the lone Ballard stop: just drive there
      else expect(s.mode).toBe("walk");
    }
    // Every walking group ends back at the car before driving on.
    const parkIdx = plan.steps.map((s, i) => (s.kind === "park" ? i : -1)).filter((i) => i > 0);
    for (const i of parkIdx) expect(["back_to_car", "stop"]).toContain(plan.steps[i - 1].kind);
    expect(plan.driveMeters).toBeGreaterThan(0);
    expect(plan.walkMeters).toBeGreaterThan(0);
  });

  it("walk mode visits every stop on foot with arrival times", () => {
    const plan = planRoute({ start: STOPS[0], stops: STOPS.slice(0, 3), mode: "walk", departAt: new Date(2026, 8, 23, 14, 0), dwellMinutes: 10 });
    const stops = plan.steps.filter((s) => s.kind === "stop");
    expect(stops).toHaveLength(3);
    expect(stops[0].stop.id).toBe(1); // starting at Victrola
    expect(plan.driveMeters).toBe(0);
    for (let i = 1; i < stops.length; i++) expect(stops[i].arrive.getTime()).toBeGreaterThan(stops[i - 1].depart.getTime());
  });

  it("drive mode adds parking time to each leg", () => {
    const plan = planRoute({ start: START, stops: STOPS, mode: "drive", departAt: new Date(2026, 8, 23, 14, 0), dwellMinutes: 10 });
    for (const s of plan.steps) {
      expect(s.mode).toBe("drive");
      if (s.meters > 0) expect(s.minutes).toBeGreaterThan(5);
    }
  });

  it("flags arrivals outside the walk-in window", () => {
    const window = { start: "14:00", end: "16:00" };
    expect(isOutsideWindow(new Date(2026, 8, 23, 13, 59), window)).toBe(true);
    expect(isOutsideWindow(new Date(2026, 8, 23, 14, 30), window)).toBe(false);
    expect(isOutsideWindow(new Date(2026, 8, 23, 16, 1), window)).toBe(true);
    const plan = planRoute({ start: START, stops: STOPS, mode: "drive", departAt: new Date(2026, 8, 23, 15, 30), dwellMinutes: 20, window });
    const stops = plan.steps.filter((s) => s.kind === "stop");
    expect(stops.some((s) => s.outsideWindow)).toBe(true);
  });

  it("formats clock times", () => {
    expect(formatClock("14:00")).toBe("2 PM");
    expect(formatClock("09:30")).toBe("9:30 AM");
    expect(formatClock("00:00")).toBe("12 AM");
  });

  it("builds plain Google Maps directions links", () => {
    const url = navigateUrl({ lat: 47.61426, lng: -122.31767 }, "walk");
    expect(url).toBe("https://www.google.com/maps/dir/?api=1&destination=47.614260%2C-122.317670&travelmode=walking");
  });
});
