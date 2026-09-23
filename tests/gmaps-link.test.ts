import { describe, expect, it, vi } from "vitest";
import { extractUrl, isShortLink, parseMapsUrl, parseSharedText, resolveShortLink } from "@/lib/gmaps-link";

const PLACE_URL =
  "https://www.google.com/maps/place/Victrola+Coffee+Roasters/@47.6139,-122.3190,17z/data=!3m1!4b1!4m6!3m5!1s0x54906acd2f0b2a0f:0x1!8m2!3d47.6142567!4d-122.3176723!16s%2Fg%2F1tf2xb2s?entry=ttu";

describe("parseMapsUrl", () => {
  it("prefers the place pin (!3d!4d) over the viewport and reads the name", () => {
    const p = parseMapsUrl(PLACE_URL);
    expect(p.name).toBe("Victrola Coffee Roasters");
    expect(p.lat).toBeCloseTo(47.6142567, 6);
    expect(p.lng).toBeCloseTo(-122.3176723, 6);
    expect(p.precision).toBe("place");
  });

  it("falls back to the @lat,lng viewport center", () => {
    const p = parseMapsUrl("https://www.google.com/maps/place/Elm+Coffee/@47.6003,-122.3321,18z");
    expect(p.name).toBe("Elm Coffee");
    expect(p.lat).toBeCloseTo(47.6003);
    expect(p.precision).toBe("viewport");
  });

  it("reads ?q=lat,lng", () => {
    const p = parseMapsUrl("https://maps.google.com/?q=47.61,-122.33");
    expect(p).toMatchObject({ lat: 47.61, lng: -122.33, precision: "place" });
  });

  it("reads ?q=Name, address text (iPhone ftid links)", () => {
    const p = parseMapsUrl("https://maps.google.com/?q=Herkimer+Coffee,+7320+Greenwood+Ave+N,+Seattle,+WA+98103&ftid=0x5490:0x1");
    expect(p.name).toBe("Herkimer Coffee");
    expect(p.address).toBe("7320 Greenwood Ave N, Seattle, WA 98103");
    expect(p.lat).toBeNull();
  });

  it("handles a cid-only link without inventing coordinates", () => {
    const p = parseMapsUrl("https://maps.google.com/?cid=1234567890");
    expect(p.lat).toBeNull();
    expect(p.name).toBeNull();
  });

  it("reads coordinates from /maps/search/lat,lng", () => {
    const p = parseMapsUrl("https://www.google.com/maps/search/47.6205,+-122.3493");
    expect(p.lat).toBeCloseTo(47.6205);
    expect(p.lng).toBeCloseTo(-122.3493);
  });
});

describe("parseSharedText", () => {
  it("parses Android share text with name, address and short link", () => {
    const p = parseSharedText("Victrola Coffee Roasters\n310 E Pike St, Seattle, WA 98122\nhttps://maps.app.goo.gl/AbC123");
    expect(p.url).toBe("https://maps.app.goo.gl/AbC123");
    expect(p.name).toBe("Victrola Coffee Roasters");
    expect(p.address).toBe("310 E Pike St, Seattle, WA 98122");
    expect(p.lat).toBeNull();
  });

  it("uses the share-sheet title when the text is just a link", () => {
    const p = parseSharedText("https://maps.app.goo.gl/xyz", "Milstead & Co.");
    expect(p.name).toBe("Milstead & Co.");
  });

  it("extracts a URL from surrounding text", () => {
    expect(extractUrl("look (https://maps.app.goo.gl/q1).")).toBe("https://maps.app.goo.gl/q1");
    expect(isShortLink("https://maps.app.goo.gl/q1")).toBe(true);
    expect(isShortLink("https://goo.gl/maps/q1")).toBe(true);
    expect(isShortLink("https://www.google.com/maps/place/x")).toBe(false);
  });
});

describe("resolveShortLink", () => {
  it("follows redirects to the full place URL", async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.includes("maps.app.goo.gl")) return new Response(null, { status: 302, headers: { location: PLACE_URL } });
      throw new Error("should not fetch the final page");
    });
    await expect(resolveShortLink("https://maps.app.goo.gl/AbC123", fetchImpl)).resolves.toBe(PLACE_URL);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("unwraps the EU consent page", async () => {
    const consent = `https://consent.google.com/m?continue=${encodeURIComponent(PLACE_URL)}`;
    const fetchImpl = vi.fn(async () => new Response(null, { status: 302, headers: { location: consent } }));
    await expect(resolveShortLink("https://maps.app.goo.gl/AbC123", fetchImpl)).resolves.toBe(PLACE_URL);
  });

  it("refuses to follow non-Google links", async () => {
    await expect(resolveShortLink("https://evil.example.com/x", vi.fn())).rejects.toThrow();
    const fetchImpl = vi.fn(async () => new Response(null, { status: 302, headers: { location: "http://169.254.169.254/latest" } }));
    await expect(resolveShortLink("https://maps.app.goo.gl/AbC123", fetchImpl)).rejects.toThrow();
  });
});
