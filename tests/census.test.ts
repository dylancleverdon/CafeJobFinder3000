import { describe, expect, it, vi } from "vitest";
import { buildBatchCsv, geocodeBatch, geocodeOne, parseBatchResponse, parseCsvLine } from "@/lib/geocode/census";
import { zipCentroid } from "@/lib/geocode/zipCentroid";

// Shape of a real addressbatch response.
const RESPONSE = [
  `"1","1124 E PIKE ST, SEATTLE, WA, 98122","Match","Exact","1124 E PIKE ST, SEATTLE, WA, 98122","-122.317665,47.614092","123456789","L"`,
  `"2","7302 1/2 15TH AVE NW, SEATTLE, WA, 98117","No_Match"`,
  `"3","100 MAIN ST, SEATTLE, WA, 98104","Tie"`,
  `"4","510 PIKE ST, SEATTLE, WA, 98101","Match","Non_Exact","510 PIKE ST, SEATTLE, WA, 98101","-122.335,47.6108","987","R"`,
].join("\n");

describe("census geocoder", () => {
  it("builds the batch CSV", () => {
    expect(buildBatchCsv([{ id: 7, street: '1 "A" St', city: "Seattle", state: "WA", zip: null }])).toBe(`7,"1 'A' St","Seattle","WA",""\n`);
  });

  it("parses matches and skips no-match/tie rows", () => {
    const hits = parseBatchResponse(RESPONSE);
    expect([...hits.keys()]).toEqual(["1", "4"]);
    expect(hits.get("1")).toMatchObject({ lat: 47.614092, lng: -122.317665, exact: true });
    expect(hits.get("4")!.exact).toBe(false);
    expect(parseCsvLine(`"a,b","c""d",e`)).toEqual(["a,b", 'c"d', "e"]);
  });

  it("posts a multipart batch", async () => {
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toContain("/addressbatch");
      const body = init!.body as FormData;
      expect(body.get("benchmark")).toBe("Public_AR_Current");
      expect(await (body.get("addressFile") as Blob).text()).toContain("1124 E Pike St");
      return new Response(RESPONSE);
    });
    const hits = await geocodeBatch([{ id: 1, street: "1124 E Pike St", city: "Seattle", state: "WA", zip: "98122" }], fetchImpl);
    expect(hits.size).toBe(2);
  });

  it("geocodes a single address", async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json({ result: { addressMatches: [{ matchedAddress: "1124 E PIKE ST, SEATTLE, WA, 98122", coordinates: { x: -122.3176, y: 47.6141 } }] } }),
    );
    await expect(geocodeOne("1124 E Pike St, Seattle, WA", fetchImpl)).resolves.toMatchObject({ lat: 47.6141, lng: -122.3176 });
  });

  it("falls back to ZIP centers", () => {
    const c = zipCentroid("98122-4415");
    expect(c!.lat).toBeCloseTo(47.61, 1);
    expect(zipCentroid("00000")).toBeNull();
  });
});
