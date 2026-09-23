import { describe, expect, it } from "vitest";
import { directionsUrl, planAreaRoute, streetOrder, type AreaStopInput } from "@/lib/route/areaPlan";
import { zipCentroid } from "@/lib/geocode/zipCentroid";

const approx = (id: string, name: string, address: string, zip: string): AreaStopInput => {
  const c = zipCentroid(zip)!;
  return { id, name, address, zip, lat: c.lat, lng: c.lng, exact: false };
};

const STOPS = [
  approx("a", "Fremont Coffee", "459 N 36th St", "98103"),
  approx("b", "Milstead & Company", "754 N 34th St", "98103"),
  approx("c", "Analog Coffee", "235 Summit Ave E", "98102"),
  approx("d", "Victrola", "411 15th Ave E", "98112"),
  approx("e", "Herkimer Coffee", "7320 Greenwood Ave N", "98103"),
  approx("f", "Fremont Twin", "600 N 36th St", "98103"),
];
const DOWNTOWN = { lat: 47.6101, lng: -122.3421 };

describe("planAreaRoute", () => {
  it("groups stops by neighborhood and keeps each neighborhood together", () => {
    const plan = planAreaRoute({ stops: STOPS, mode: "park_walk", start: DOWNTOWN, departAt: new Date(2026, 8, 23, 14), dwellMinutes: 10 });
    const stopZips = plan.steps.filter((s) => s.kind === "stop").map((s) => (s.kind === "stop" ? s.stop.zip : ""));
    // Each ZIP appears as one contiguous run.
    const runs = stopZips.filter((z, i) => z !== stopZips[i - 1]);
    expect(new Set(runs).size).toBe(runs.length);
    expect(plan.areas).toBe(3);
    expect(plan.steps.filter((s) => s.kind === "stop")).toHaveLength(6);
  });

  it("orders cafes on the same street by house number", () => {
    const ordered = streetOrder(STOPS.filter((s) => s.zip === "98103"));
    expect(ordered.map((s) => s.id)).toEqual(["e", "b", "a", "f"]); // Greenwood Ave N, then N 34th St, then N 36th St 459 → 600
  });

  it("drive + walk parks once per neighborhood with more than one stop", () => {
    const plan = planAreaRoute({ stops: STOPS, mode: "park_walk", start: DOWNTOWN, departAt: new Date(2026, 8, 23, 14), dwellMinutes: 10 });
    const fremont = plan.steps.find((s) => s.kind === "area" && s.zip === "98103");
    expect(fremont && fremont.kind === "area" && fremont.parkAt?.id).toBeTruthy();
    const walkLegs = plan.steps.filter((s) => s.kind === "stop" && s.leg?.mode === "walk");
    expect(walkLegs.length).toBe(3); // 4 Fremont stops → 3 walks between them
  });

  it("times are in order and flag the walk-in window", () => {
    const plan = planAreaRoute({ stops: STOPS, mode: "drive", start: DOWNTOWN, departAt: new Date(2026, 8, 23, 15, 30), dwellMinutes: 15, window: { start: "14:00", end: "16:00" } });
    const stops = plan.steps.filter((s) => s.kind === "stop");
    for (let i = 1; i < stops.length; i++) expect(stops[i].arrive.getTime()).toBeGreaterThan(stops[i - 1].arrive.getTime());
    expect(stops.some((s) => s.kind === "stop" && s.outsideWindow)).toBe(true);
  });

  it("uses real distances for exact pins", () => {
    const exact: AreaStopInput[] = [
      { id: "x", name: "A", address: "1 A St", zip: "98122", lat: 47.61426, lng: -122.3268, exact: true },
      { id: "y", name: "B", address: "2 B St", zip: "98122", lat: 47.6203, lng: -122.3254, exact: true },
    ];
    const plan = planAreaRoute({ stops: exact, mode: "walk", start: { lat: 47.6143, lng: -122.3268 }, departAt: new Date(2026, 8, 23, 14), dwellMinutes: 10 });
    const second = plan.steps.filter((s) => s.kind === "stop")[1];
    expect(second.kind === "stop" && second.leg?.guess).toBe(false);
    expect(second.kind === "stop" && second.leg?.meters).toBeGreaterThan(500);
  });

  it("warns when a walking day spans far-apart neighborhoods", () => {
    const plan = planAreaRoute({ stops: STOPS, mode: "walk", start: DOWNTOWN, departAt: new Date(2026, 8, 23, 14), dwellMinutes: 10 });
    expect(plan.walkWarning).toBe(true);
  });

  it("links to Google Maps by address when the pin is approximate", () => {
    expect(directionsUrl(STOPS[0], "walk")).toBe(
      "https://www.google.com/maps/dir/?api=1&destination=Fremont+Coffee%2C+459+N+36th+St%2C+Seattle%2C+WA+98103&travelmode=walking",
    );
    expect(directionsUrl({ ...STOPS[0], exact: true, lat: 47.65, lng: -122.35 }, "drive")).toContain("destination=47.650000%2C-122.350000&travelmode=driving");
  });
});
