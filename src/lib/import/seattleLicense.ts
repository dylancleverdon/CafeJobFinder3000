/**
 * Seattle "Active Business License Tax Certificate" export (data.seattle.gov).
 * Pure functions — runs in the browser (the file is ~18 MB, too big to upload
 * to a serverless function) and in the seed build script.
 */
import type { Category } from "@/db/schema";
import { isChain } from "../chains";
import { formatPhone, titleCase, yyyymmddToIso } from "../text";
import { placeKey, stripUnit } from "./dedupe";

export const SEATTLE_LICENSE_COLUMNS = {
  legalName: "Business Legal Name",
  tradeName: "Trade Name",
  naics: "NAICS Code",
  naicsDescription: "NAICS Description",
  startDate: "License Start Date",
  street: "Street Address",
  city: "City",
  state: "State",
  zip: "Zip",
  phone: "Business Phone",
} as const;

export type LicenseRow = Record<string, string | undefined>;

export function isSeattleLicenseFile(headers: string[]): boolean {
  const set = new Set(headers.map((h) => h.trim()));
  return ["Trade Name", "NAICS Code", "Street Address", "City", "Zip"].every((h) => set.has(h));
}

// NAICS codes worth looking at (everything else is ignored).
const FOOD_CODES = new Set([
  "722515", // snack & nonalcoholic beverage bars (coffee shops live here)
  "722511", // full-service restaurants
  "722513", // limited-service restaurants
  "722514", // cafeterias
  "722330", // mobile food (espresso stands/carts)
  "311811", // retail bakeries
  "445291", // baked goods retailers
  "445298", // other specialty food retailers
  "311920", // coffee & tea manufacturing (roasters)
]);
const BAKERY_CODES = new Set(["311811", "445291"]);

// Strong coffee words count for any food business.
const COFFEE_STRONG =
  /(\bCOFFEE|\bCAFE|\bCAFÉ|\bCAFFE|\bCAFFÈ|\bCAFFÉ|ESPRESSO|\bROASTERS?\b|\bROASTERY\b|\bLATTES?\b|\bBARISTAS?\b|\bKOFFEE|\bKAFFE|\bKAFE\b|\bMOKA\b)/;
// Weaker words only count for beverage bars and stands (a "roast" restaurant or
// "black bean" grill isn't a coffee shop).
const COFFEE_WEAK = /\b(BEANS?|JAVA|MOCHA|ROAST|ROASTING|CUPPA|BREW|BREWS|DRIP)\b/;
const WEAK_OK_CODES = new Set(["722515", "722330", "445298"]);
const TEA = /(TEA\b|\bTEAS?\b|\bBOBA\b|\bBUBBLE\b|\bMATCHA\b|\bCHAI\b|\bTAPIOCA\b|KOMBUCHA)/;
const TEA_CODES = new Set(["722515", "722513", "445298", "722330"]);
const BAKERY =
  /(BAKERY|BAKERIES|BAKEHOUSE|BAKESHOP|BAKING|\bBAKES?\b|BAGELS?|DONUTS?|DOUGHNUTS?|PASTRY|PASTRIES|PATISSERIE|BOULANGERIE|CROISSANTS?|BREAKFAST|BRUNCH|CREPES?\b|CREPERIE|WAFFLES?|PANCAKES?|\bDINER\b|KOLACHES?|BISCUITS?|MUFFINS?|BRIOCHE|SCONES?)/;
// Beverage/snack bars that clearly don't sell coffee.
const NO_COFFEE = /(POPCORN|KETTLE CORN|SHAVE ICE|SHAVED ICE|CANDY|CANDIES|CHOCOLATIER|FUDGE|\bNUTS\b|JERKY|HOT DOGS?|PRETZELS?|COTTON CANDY)/;

// Corporate offices that show up under food codes.
const HQ_STREETS = [/^2401\s+UTAH\s+AVE\s+S\b/]; // Starbucks HQ
const NOT_A_STORE_NAME = /^(BOD\b|BOARD OF DIRECTORS\b)/;

/** "BAGEL FACTORY LLC" → "Bagel Factory" */
export function displayName(raw: string): string {
  return titleCase(raw.replace(/[\s,]+(LLC|L\.L\.C\.?|INC\.?|CORP\.?|CORPORATION|LTD\.?|PLLC)\s*$/i, ""));
}

export function categorize(naics: string, text: string): Category | null {
  const t = text.toUpperCase();
  if (!FOOD_CODES.has(naics)) return null;
  if (COFFEE_STRONG.test(t)) return "coffee";
  if ((TEA_CODES.has(naics) || naics === "311920") && TEA.test(t)) return "tea";
  if (naics === "311920") return "coffee"; // coffee & tea manufacturing = roasters
  if (WEAK_OK_CODES.has(naics) && COFFEE_WEAK.test(t)) return "coffee";
  if (BAKERY_CODES.has(naics) || BAKERY.test(t)) return "bakery";
  if (naics === "722515" && !NO_COFFEE.test(t)) return "other";
  return null;
}

export type LicenseCandidate = {
  licenseKey: string;
  name: string;
  legalName: string | null;
  address: string; // street line, title-cased, unit kept for display
  zip: string | null;
  phone: string | null;
  naics: string;
  category: Category;
  licenseStartDate: string | null;
  isChain: boolean;
};

export type LicenseFilterStats = {
  totalRows: number;
  outsideSeattle: number;
  corporateOffices: number;
  notFood: number;
  duplicates: number;
  kept: number;
  byCategory: Record<Category, number>;
};

export function filterSeattleLicenses(rows: LicenseRow[], opts: { city?: string } = {}): {
  candidates: LicenseCandidate[];
  stats: LicenseFilterStats;
} {
  const city = (opts.city ?? "SEATTLE").toUpperCase();
  const C = SEATTLE_LICENSE_COLUMNS;
  const stats: LicenseFilterStats = {
    totalRows: rows.length,
    outsideSeattle: 0,
    corporateOffices: 0,
    notFood: 0,
    duplicates: 0,
    kept: 0,
    byCategory: { coffee: 0, bakery: 0, tea: 0, other: 0 },
  };
  const seen = new Set<string>();
  const candidates: LicenseCandidate[] = [];

  for (const row of rows) {
    const trade = (row[C.tradeName] ?? "").trim();
    const legal = (row[C.legalName] ?? "").trim();
    const rawName = trade || legal;
    const street = (row[C.street] ?? "").replace(/\s+/g, " ").trim();
    const naics = (row[C.naics] ?? "").trim();
    if (!rawName || !street) {
      stats.notFood++;
      continue;
    }
    if ((row[C.city] ?? "").trim().toUpperCase() !== city) {
      stats.outsideSeattle++;
      continue;
    }
    if (NOT_A_STORE_NAME.test(rawName.toUpperCase()) || HQ_STREETS.some((re) => re.test(street.toUpperCase()))) {
      stats.corporateOffices++;
      continue;
    }
    const category = categorize(naics, `${trade} ${legal}`);
    if (!category) {
      stats.notFood++;
      continue;
    }
    const key = placeKey(rawName, street);
    if (seen.has(key)) {
      stats.duplicates++;
      continue;
    }
    seen.add(key);
    candidates.push({
      licenseKey: key,
      name: displayName(rawName),
      legalName: legal && legal !== trade ? titleCase(legal) : null,
      address: titleCase(street),
      zip: (row[C.zip] ?? "").trim().slice(0, 5) || null,
      phone: formatPhone(row[C.phone]),
      naics,
      category,
      licenseStartDate: yyyymmddToIso(row[C.startDate]),
      isChain: isChain(trade, legal),
    });
    stats.byCategory[category]++;
  }
  stats.kept = candidates.length;
  return { candidates, stats };
}

/** Geocoder-friendly street (no suite numbers). */
export function geocodeStreet(address: string): string {
  return stripUnit(address);
}

export type LicenseDiff = {
  added: LicenseCandidate[];
  unchanged: LicenseCandidate[];
  /** licenseKeys in the database that are no longer in the file. */
  missing: string[];
  /** licenseKeys that were flagged "may have closed" but are back. */
  returned: string[];
};

export function diffLicenseImport(
  existing: { licenseKey: string; mayHaveClosed: boolean }[],
  candidates: LicenseCandidate[],
): LicenseDiff {
  const existingMap = new Map(existing.map((e) => [e.licenseKey, e]));
  const incoming = new Set(candidates.map((c) => c.licenseKey));
  const added: LicenseCandidate[] = [];
  const unchanged: LicenseCandidate[] = [];
  const returned: string[] = [];
  for (const c of candidates) {
    const e = existingMap.get(c.licenseKey);
    if (!e) added.push(c);
    else {
      unchanged.push(c);
      if (e.mayHaveClosed) returned.push(c.licenseKey);
    }
  }
  const missing = existing.filter((e) => !incoming.has(e.licenseKey) && !e.mayHaveClosed).map((e) => e.licenseKey);
  return { added, unchanged, missing, returned };
}
