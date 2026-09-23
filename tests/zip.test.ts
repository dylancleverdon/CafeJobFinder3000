import { describe, expect, it } from "vitest";
import { zipCentroid } from "@/lib/geocode/zipCentroid";

describe("ZIP centers", () => {
  it("places a cafe at its ZIP center until it has an exact pin", () => {
    const c = zipCentroid("98122-4415");
    expect(c!.lat).toBeCloseTo(47.61, 1);
    expect(zipCentroid("00000")).toBeNull();
  });
});
