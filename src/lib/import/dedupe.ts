import { haversine, type LatLng } from "../route/geo";

const NAME_NOISE = /\b(LLC|L L C|INC|CORP|CORPORATION|CO|COMPANY|LTD|THE|PLLC|LP)\b/g;

export function normalizeName(name: string): string {
  return name
    .toUpperCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " AND ")
    .replace(/[^A-Z0-9 ]/g, " ")
    .replace(NAME_NOISE, " ")
    .replace(/\s{2,}\d+\s*$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

const STREET_WORDS: Record<string, string> = {
  AVENUE: "AVE", STREET: "ST", ROAD: "RD", BOULEVARD: "BLVD", DRIVE: "DR", PLACE: "PL", COURT: "CT",
  LANE: "LN", PARKWAY: "PKWY", HIGHWAY: "HWY", TERRACE: "TER", WAY: "WAY",
  NORTH: "N", SOUTH: "S", EAST: "E", WEST: "W", NORTHEAST: "NE", NORTHWEST: "NW", SOUTHEAST: "SE", SOUTHWEST: "SW",
};

const UNIT = /\s*(#.*|\b(STE|SUITE|UNIT|APT|BLDG|BUILDING|FL|FLOOR|RM|ROOM|SPC|SPACE|STALL|KIOSK)\b.*)$/i;

/** Street line without suite/unit parts — what a geocoder wants. */
export function stripUnit(street: string): string {
  return street.replace(UNIT, "").replace(/\s+/g, " ").trim();
}

export function normalizeStreet(street: string): string {
  // "235 Summit Ave E, Seattle, WA 98102" → just the street line.
  return stripUnit(street.split(",")[0].toUpperCase())
    .replace(/[.,]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => STREET_WORDS[w] ?? w)
    .join(" ");
}

export function placeKey(name: string, street: string): string {
  return `${normalizeName(name)}|${normalizeStreet(street)}`;
}

export type Dedupable = { name: string; address?: string | null; lat?: number | null; lng?: number | null };

/** Same place if same normalized address + overlapping name, or same name within 75 m. */
export function isSamePlace(a: Dedupable, b: Dedupable): boolean {
  const na = normalizeName(a.name);
  const nb = normalizeName(b.name);
  const nameMatch = na === nb || (na.length > 3 && nb.length > 3 && (na.includes(nb) || nb.includes(na)));
  if (a.address && b.address && normalizeStreet(a.address) === normalizeStreet(b.address) && nameMatch) return true;
  if (na === nb && a.lat != null && a.lng != null && b.lat != null && b.lng != null) {
    return haversine(a as LatLng, b as LatLng) <= 75;
  }
  return false;
}
