/** Generic CSV import (e.g. King County food inspections). Pure — runs in the browser. */
import { isChain } from "../chains";
import { haversine, type LatLng } from "../route/geo";
import { formatPhone, titleCase } from "../text";
import { categorize } from "./seattleLicense";
import type { Category } from "@/lib/types";

export type ColumnMap = Partial<Record<"name" | "address" | "city" | "zip" | "lat" | "lng" | "type" | "phone", string>>;

const SYNONYMS: Record<keyof ColumnMap, RegExp> = {
  name: /^(trade ?name|dba|dba ?name|business ?name|facility ?name|establishment ?name|program ?identifier|name|restaurant ?name|inspection ?business ?name)$/i,
  address: /^(street ?address|address|site ?address|location ?address|address ?line ?1|street|facility ?address)$/i,
  city: /^(city|site ?city|facility ?city)$/i,
  zip: /^(zip|zip ?code|postal ?code|zipcode|site ?zip)$/i,
  lat: /^(lat|latitude|y)$/i,
  lng: /^(lng|lon|long|longitude|x)$/i,
  type: /^(naics ?description|facility ?type|business ?type|description|type|category|risk ?description|program ?type)$/i,
  phone: /^(phone|business ?phone|telephone|phone ?number)$/i,
};

export function detectColumns(headers: string[]): ColumnMap {
  const map: ColumnMap = {};
  for (const key of Object.keys(SYNONYMS) as (keyof ColumnMap)[]) {
    const hit = headers.find((h) => SYNONYMS[key].test(h.trim()));
    if (hit) map[key] = hit;
  }
  return map;
}

export type CsvCandidate = {
  name: string;
  address: string | null;
  zip: string | null;
  phone: string | null;
  lat: number | null;
  lng: number | null;
  category: Category;
  isChain: boolean;
};

export function filterGenericCsv(
  rows: Record<string, string | undefined>[],
  map: ColumnMap,
  opts: { center?: LatLng | null; radiusM?: number } = {},
): CsvCandidate[] {
  const out: CsvCandidate[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const name = (map.name ? row[map.name] : "")?.trim();
    if (!name) continue;
    // Reuse the Seattle keyword rules, treating every row as a beverage bar so
    // any coffee/tea/bakery-sounding name counts.
    const category = categorize("722515", `${name} ${map.type ? row[map.type] ?? "" : ""}`);
    if (!category || category === "other") continue;
    const lat = map.lat ? Number(row[map.lat]) : NaN;
    const lng = map.lng ? Number(row[map.lng]) : NaN;
    const hasPin = Number.isFinite(lat) && Number.isFinite(lng) && lat !== 0 && lng !== 0;
    if (opts.center && opts.radiusM && hasPin && haversine(opts.center, { lat, lng }) > opts.radiusM) continue;
    const address = map.address ? row[map.address]?.trim() || null : null;
    const key = `${name.toUpperCase()}|${(address ?? "").toUpperCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      name: titleCase(name),
      address: address ? titleCase(address) : null,
      zip: map.zip ? row[map.zip]?.trim().slice(0, 5) || null : null,
      phone: map.phone ? formatPhone(row[map.phone]) : null,
      lat: hasPin ? lat : null,
      lng: hasPin ? lng : null,
      category,
      isChain: isChain(name),
    });
  }
  return out;
}
