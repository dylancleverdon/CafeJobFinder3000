import { describe, expect, it } from "vitest";
import { autoPick, isVisitable, priorityScore, type Rankable } from "@/lib/priority";

const now = new Date(2026, 8, 23, 12, 0);
const base: Rankable = {
  id: 0, stage: "discovered", nextActionAt: null, interest: 0, category: "coffee", licenseStartDate: null,
  hiringSign: false, mayHaveClosed: false, hidden: false, pinQuality: "exact", lat: 47.6142, lng: -122.3177,
};

describe("priority", () => {
  it("due follow-ups and hiring signs rank first", () => {
    const due = { ...base, id: 1, stage: "applied" as const, nextActionAt: new Date(2026, 8, 22) };
    const sign = { ...base, id: 2, hiringSign: true };
    const plain = { ...base, id: 3 };
    expect(priorityScore(due, now)).toBeGreaterThan(priorityScore(sign, now));
    expect(priorityScore(sign, now)).toBeGreaterThan(priorityScore(plain, now));
  });

  it("waiting cafes aren't visitable until their date", () => {
    expect(isVisitable({ ...base, stage: "applied", nextActionAt: new Date(2026, 8, 28) }, now)).toBe(false);
    expect(isVisitable({ ...base, stage: "applied", nextActionAt: new Date(2026, 8, 23, 18) }, now)).toBe(true);
    expect(isVisitable({ ...base, stage: "closed" }, now)).toBe(false);
    expect(isVisitable({ ...base, hidden: true }, now)).toBe(false);
  });

  it("autoPick skips approximate pins, stays in radius and caps the count", () => {
    const cafes: Rankable[] = [
      { ...base, id: 1 },
      { ...base, id: 2, pinQuality: "approximate" },
      { ...base, id: 3, lat: 47.9, lng: -122.3 }, // ~32 km away
      { ...base, id: 4, interest: 5, lat: 47.6152, lng: -122.3187 },
      { ...base, id: 5, lat: 47.6162, lng: -122.3197 },
    ];
    const picked = autoPick(cafes, { start: { lat: 47.6142, lng: -122.3177 }, mode: "walk", maxStops: 2, now });
    expect(picked.map((c) => c.id)).toEqual([4, 1]);
  });
});
