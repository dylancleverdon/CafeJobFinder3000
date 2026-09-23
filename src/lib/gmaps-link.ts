/**
 * Reads cafe name + location out of a Google Maps share link — no API, just
 * the link text. Short links (maps.app.goo.gl) are expanded server-side by
 * following their redirect.
 */
export type ParsedPlace = {
  url: string | null;
  name: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  /** "place" = the cafe's own pin, "viewport" = map center (less precise). */
  precision: "place" | "viewport" | null;
};

const URL_RE = /https?:\/\/[^\s<>"']+/i;
const COORD_PAIR = /^\s*(-?\d{1,3}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)\s*$/;

export function extractUrl(text: string): string | null {
  const m = URL_RE.exec(text);
  return m ? m[0].replace(/[).,]+$/, "") : null;
}

const SHORT_HOSTS = new Set(["maps.app.goo.gl", "goo.gl", "g.co"]);
const GOOGLE_HOST = /(^|\.)google\.[a-z.]+$|^maps\.app\.goo\.gl$|^goo\.gl$|^g\.co$/i;

export function isShortLink(url: string): boolean {
  try {
    const u = new URL(url);
    return SHORT_HOSTS.has(u.hostname) && (u.hostname !== "goo.gl" || u.pathname.startsWith("/maps"));
  } catch {
    return false;
  }
}

export function isGoogleUrl(url: string): boolean {
  try {
    return GOOGLE_HOST.test(new URL(url).hostname);
  } catch {
    return false;
  }
}

function validCoords(lat: number, lng: number): boolean {
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && !(lat === 0 && lng === 0);
}

const decode = (s: string) => {
  try {
    return decodeURIComponent(s.replace(/\+/g, " ")).trim();
  } catch {
    return s.replace(/\+/g, " ").trim();
  }
};

/** Splits "Cafe Name, 123 Main St, Seattle, WA 98101" into name + address. */
function splitNameAddress(text: string): { name: string | null; address: string | null } {
  const parts = text.split(",").map((p) => p.trim()).filter(Boolean);
  if (!parts.length) return { name: null, address: null };
  if (/^\d/.test(parts[0])) return { name: null, address: parts.join(", ") };
  return { name: parts[0], address: parts.length > 1 ? parts.slice(1).join(", ") : null };
}

export function parseMapsUrl(url: string): ParsedPlace {
  const out: ParsedPlace = { url, name: null, address: null, lat: null, lng: null, precision: null };
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return out;
  }

  // 1) The place's own pin: ...!3d47.6139!4d-122.3177...
  const pins = [...url.matchAll(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/g)];
  if (pins.length) {
    const [, lat, lng] = pins[pins.length - 1];
    if (validCoords(+lat, +lng)) Object.assign(out, { lat: +lat, lng: +lng, precision: "place" });
  }

  // 2) Name from /maps/place/<Name>/ or /maps/search/<text>/
  const place = /\/maps\/place\/([^/@?]+)/.exec(u.pathname);
  const search = /\/maps\/search\/([^/@?]+)/.exec(u.pathname);
  if (place) {
    const text = decode(place[1]);
    const coords = COORD_PAIR.exec(text);
    if (coords) {
      if (out.lat == null && validCoords(+coords[1], +coords[2])) Object.assign(out, { lat: +coords[1], lng: +coords[2], precision: "place" });
    } else Object.assign(out, splitNameAddress(text));
  } else if (search) {
    const text = decode(search[1]);
    const coords = COORD_PAIR.exec(text);
    if (coords) {
      if (validCoords(+coords[1], +coords[2])) Object.assign(out, { lat: +coords[1], lng: +coords[2], precision: "place" });
    } else Object.assign(out, splitNameAddress(text));
  }

  // 3) ?q= / ?query= / ?ll= / ?destination=
  for (const key of ["q", "query", "ll", "destination", "daddr"]) {
    const v = u.searchParams.get(key);
    if (!v) continue;
    const coords = COORD_PAIR.exec(v.replace(/^loc:/, ""));
    if (coords) {
      if (out.lat == null && validCoords(+coords[1], +coords[2])) Object.assign(out, { lat: +coords[1], lng: +coords[2], precision: "place" });
    } else if (!out.name && !out.address) {
      Object.assign(out, splitNameAddress(v.trim()));
    }
  }

  // 4) Fallback: map viewport center /@47.61,-122.31,17z
  if (out.lat == null) {
    const at = /@(-?\d+\.\d+),(-?\d+\.\d+)/.exec(url);
    if (at && validCoords(+at[1], +at[2])) Object.assign(out, { lat: +at[1], lng: +at[2], precision: "viewport" });
  }
  return out;
}

/**
 * What the Google Maps app shares, e.g. (Android)
 *   "Victrola Coffee Roasters\n310 E Pike St, Seattle, WA 98122\nhttps://maps.app.goo.gl/abc"
 * or (iPhone) just the link. `title` comes from the share sheet when present.
 */
export function parseSharedText(text: string, title?: string | null): ParsedPlace {
  const url = extractUrl(text);
  const parsed: ParsedPlace = url && !isShortLink(url) ? parseMapsUrl(url) : { url, name: null, address: null, lat: null, lng: null, precision: null };
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.replace(URL_RE, "").trim())
    .filter(Boolean);
  if (!parsed.name && lines[0] && !/^\d/.test(lines[0])) parsed.name = lines[0];
  if (!parsed.address) {
    const addr = lines.find((l, i) => (i > 0 || /^\d/.test(l)) && /\d/.test(l));
    if (addr) parsed.address = addr;
  }
  if (!parsed.name && title && !/google maps/i.test(title)) parsed.name = title.trim();
  return parsed;
}

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

/** Follows a short link's redirects (Google hosts only) and returns the final URL. */
export async function resolveShortLink(url: string, fetchImpl: FetchLike = fetch, maxHops = 6): Promise<string> {
  let current = url;
  for (let hop = 0; hop < maxHops; hop++) {
    if (!isGoogleUrl(current)) throw new Error("Not a Google Maps link");
    const u = new URL(current);
    // EU cookie-consent interstitial: the real URL is in ?continue=
    if (u.hostname.startsWith("consent.")) {
      const cont = u.searchParams.get("continue");
      if (!cont) break;
      current = cont;
      continue;
    }
    if (!isShortLink(current) && /\/maps|[?&](q|query|ll)=|maps\.google\./.test(current)) return current;
    const res = await fetchImpl(current, {
      method: "GET",
      redirect: "manual",
      headers: { "user-agent": "Mozilla/5.0 (CafeJobFinder3000 link reader)" },
    });
    const loc = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && loc) {
      current = new URL(loc, current).toString();
      continue;
    }
    return current;
  }
  return current;
}
