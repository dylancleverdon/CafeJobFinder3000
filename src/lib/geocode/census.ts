/**
 * U.S. Census Bureau geocoder — free, public, no account or key. Used only to
 * turn street addresses into map pins (it doesn't find cafes).
 * https://geocoding.geo.census.gov/geocoder/
 */
export const CENSUS_BASE = "https://geocoding.geo.census.gov/geocoder/locations";
export const CENSUS_BENCHMARK = "Public_AR_Current";
/** The batch endpoint accepts up to 10,000 rows; smaller batches keep each request quick. */
export const CENSUS_BATCH_SIZE = 150;

export type GeocodeInput = { id: string | number; street: string; city: string; state: string; zip: string | null };
export type GeocodeHit = { lat: number; lng: number; matchedAddress: string; exact: boolean };

const q = (s: string) => `"${s.replace(/"/g, "'")}"`;

export function buildBatchCsv(rows: GeocodeInput[]): string {
  return rows.map((r) => [String(r.id), q(r.street), q(r.city), q(r.state), q(r.zip ?? "")].join(",")).join("\n") + "\n";
}

/** Minimal CSV line parser (quoted fields, no embedded newlines — which is what Census returns). */
export function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') inQ = false;
      else cur += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

export function parseBatchResponse(text: string): Map<string, GeocodeHit> {
  const hits = new Map<string, GeocodeHit>();
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const f = parseCsvLine(line);
    // id, input address, Match|No_Match|Tie, Exact|Non_Exact, matched address, "lon,lat", tiger id, side
    if (f[2] !== "Match" || !f[5]) continue;
    const [lng, lat] = f[5].split(",").map(Number);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    hits.set(f[0], { lat, lng, matchedAddress: f[4], exact: f[3] === "Exact" });
  }
  return hits;
}

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export async function geocodeBatch(rows: GeocodeInput[], fetchImpl: FetchLike = fetch): Promise<Map<string, GeocodeHit>> {
  if (!rows.length) return new Map();
  const form = new FormData();
  form.append("addressFile", new Blob([buildBatchCsv(rows)], { type: "text/csv" }), "addresses.csv");
  form.append("benchmark", CENSUS_BENCHMARK);
  const res = await fetchImpl(`${CENSUS_BASE}/addressbatch`, { method: "POST", body: form });
  if (!res.ok) throw new Error(`Census geocoder returned ${res.status}`);
  return parseBatchResponse(await res.text());
}

export async function geocodeOne(address: string, fetchImpl: FetchLike = fetch): Promise<GeocodeHit | null> {
  const params = new URLSearchParams({ address, benchmark: CENSUS_BENCHMARK, format: "json" });
  const res = await fetchImpl(`${CENSUS_BASE}/onelineaddress?${params}`);
  if (!res.ok) throw new Error(`Census geocoder returned ${res.status}`);
  const json = (await res.json()) as {
    result?: { addressMatches?: { matchedAddress: string; coordinates: { x: number; y: number } }[] };
  };
  const m = json.result?.addressMatches?.[0];
  return m ? { lat: m.coordinates.y, lng: m.coordinates.x, matchedAddress: m.matchedAddress, exact: true } : null;
}
