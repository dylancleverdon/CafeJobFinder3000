import fs from "node:fs";
import path from "node:path";
import Papa from "papaparse";
import { describe, expect, it } from "vitest";
import { detectColumns, filterGenericCsv } from "@/lib/import/csv";
import { isSamePlace, normalizeStreet, stripUnit } from "@/lib/import/dedupe";
import { parsePastedList } from "@/lib/import/pasteList";
import { diffLicenseImport, filterSeattleLicenses, isSeattleLicenseFile, type LicenseRow } from "@/lib/import/seattleLicense";
import { isChain } from "@/lib/chains";
import { formatPhone, titleCase } from "@/lib/text";

function readCsv(file: string) {
  return Papa.parse<LicenseRow>(fs.readFileSync(file, "utf8"), { header: true, skipEmptyLines: true });
}

const sample = readCsv(path.join(__dirname, "fixtures/seattle-license-sample.csv"));

describe("Seattle license import", () => {
  const { candidates, stats } = filterSeattleLicenses(sample.data);
  const byName = (n: string) => candidates.filter((c) => c.name === n);

  it("recognises the file", () => {
    expect(isSeattleLicenseFile(sample.meta.fields!)).toBe(true);
    expect(isSeattleLicenseFile(["name", "address"])).toBe(false);
  });

  it("categorises anywhere that might sell coffee", () => {
    expect(byName("Fuel Coffee")).toHaveLength(2); // two locations, duplicate row dropped
    expect(byName("Monorail Espresso")[0].category).toBe("coffee");
    expect(byName("Herkimer Coffee")[0].category).toBe("coffee");
    expect(byName("Kjs Koffee")[0].category).toBe("coffee");
    expect(byName("Bean There Espresso Stand")[0].category).toBe("coffee");
    expect(byName("Bagel Factory")[0].category).toBe("bakery");
    expect(byName("Top Pot Doughnuts")[0].category).toBe("bakery");
    expect(byName("Sugar Bakery")[0].category).toBe("bakery");
    expect(byName("Early Bird Breakfast Diner")[0].category).toBe("bakery");
    expect(byName("Heytea South Lake Union")[0].category).toBe("tea");
    expect(byName("Communitea Kombucha")[0].category).toBe("tea");
    expect(byName("Apex Smoothies")[0].category).toBe("other");
    expect(byName("Milstead & Company")[0].category).toBe("other");
  });

  it("drops HQ rows, board members, other cities, non-food and no-coffee shops", () => {
    const names = candidates.map((c) => c.name);
    expect(names).not.toContain("Cobbs"); // popcorn
    expect(names).not.toContain("Prime Roast House"); // a "roast" restaurant isn't a coffee shop
    expect(names).not.toContain("Example Limo");
    expect(names.some((n) => n.includes("Peets"))).toBe(false); // Emeryville mailing address
    expect(candidates.filter((c) => c.address.startsWith("2401 Utah"))).toHaveLength(0);
    expect(stats.corporateOffices).toBe(2);
    expect(stats.outsideSeattle).toBe(1);
    expect(stats.duplicates).toBe(1);
  });

  it("formats names, addresses, phones, dates and flags chains", () => {
    const starbucks = byName("Starbucks Coffee #9303")[0];
    expect(starbucks.isChain).toBe(true);
    expect(starbucks.address).toBe("1962 1st Ave S");
    const mono = byName("Monorail Espresso")[0];
    expect(mono).toMatchObject({ phone: "(206) 555-1234", zip: "98101", licenseStartDate: "2012-10-01", isChain: false });
  });

  it("re-import diff: new places added, missing ones flagged, returning ones un-flagged", () => {
    const existing = candidates.map((c) => ({ licenseKey: c.licenseKey, mayHaveClosed: false }));
    const closedKey = existing[0].licenseKey;
    const next = candidates.slice(1);
    const extra = { ...candidates[1], licenseKey: "NEW|1 NEW ST", name: "New Cafe" };
    const diff = diffLicenseImport(existing, [...next, extra]);
    expect(diff.added.map((a) => a.name)).toEqual(["New Cafe"]);
    expect(diff.missing).toEqual([closedKey]);
    expect(diff.unchanged).toHaveLength(next.length);

    const again = diffLicenseImport([{ licenseKey: closedKey, mayHaveClosed: true }], [candidates[0]]);
    expect(again.returned).toEqual([closedKey]);
    expect(again.missing).toEqual([]);
  });

  const rawDir = path.join(__dirname, "../data/raw");
  const rawFile = fs.existsSync(rawDir) ? fs.readdirSync(rawDir).find((f) => f.endsWith(".csv")) : undefined;
  it.skipIf(!rawFile)("full Seattle file gives ~990 places across all four categories", () => {
    const full = filterSeattleLicenses(readCsv(path.join(rawDir, rawFile!)).data);
    expect(full.stats.kept).toBeGreaterThan(900);
    expect(full.stats.kept).toBeLessThan(1100);
    expect(full.stats.byCategory.coffee).toBeGreaterThan(500);
    expect(full.stats.byCategory.bakery).toBeGreaterThan(180);
    expect(full.stats.byCategory.tea).toBeGreaterThan(40);
    expect(full.stats.byCategory.other).toBeGreaterThan(100);
    expect(full.candidates.filter((c) => c.name.startsWith("Starbucks")).length).toBeGreaterThan(40);
  });
});

describe("dedupe + text helpers", () => {
  it("strips units and normalizes streets", () => {
    expect(stripUnit("1600 7TH AVE # 105")).toBe("1600 7TH AVE");
    expect(stripUnit("601 UNION ST STE 224B")).toBe("601 UNION ST");
    expect(normalizeStreet("310 East Pike Street")).toBe("310 E PIKE ST");
  });

  it("matches the same place across sources", () => {
    expect(isSamePlace({ name: "Victrola Coffee", address: "310 E Pike St" }, { name: "VICTROLA COFFEE LLC", address: "310 East Pike Street #1" })).toBe(true);
    expect(isSamePlace({ name: "Elm Coffee", lat: 47.6, lng: -122.33 }, { name: "Elm Coffee", lat: 47.6003, lng: -122.3302 })).toBe(true);
    expect(isSamePlace({ name: "Elm Coffee", lat: 47.6, lng: -122.33 }, { name: "Elm Coffee", lat: 47.61, lng: -122.33 })).toBe(false);
  });

  it("title-cases and formats", () => {
    expect(titleCase("BEN & JERRY'S ALKI BEACH")).toBe("Ben & Jerry's Alki Beach");
    expect(titleCase("1705 N 45TH ST")).toBe("1705 N 45th St");
    expect(formatPhone("2062579788")).toBe("(206) 257-9788");
    expect(isChain("Dutch Bros Coffee")).toBe(true);
    expect(isChain("Victrola Coffee")).toBe(false);
  });
});

describe("generic CSV + paste list", () => {
  it("auto-detects columns and keeps coffee-ish rows with pins", () => {
    const rows = [
      { "Program Identifier": "ESPRESSO EXPRESS", Address: "1 MAIN ST", Latitude: "47.61", Longitude: "-122.33", Zip: "98101" },
      { "Program Identifier": "JOE'S TIRES", Address: "2 MAIN ST", Latitude: "47.61", Longitude: "-122.33", Zip: "98101" },
      { "Program Identifier": "FAR AWAY CAFE", Address: "3 MAIN ST", Latitude: "48.5", Longitude: "-122.33", Zip: "98101" },
    ];
    const map = detectColumns(Object.keys(rows[0]));
    expect(map).toMatchObject({ name: "Program Identifier", address: "Address", lat: "Latitude", lng: "Longitude", zip: "Zip" });
    const out = filterGenericCsv(rows, map, { center: { lat: 47.61, lng: -122.33 }, radiusM: 20000 });
    expect(out.map((c) => c.name)).toEqual(["Espresso Express"]);
    expect(out[0]).toMatchObject({ lat: 47.61, lng: -122.33, category: "coffee" });
  });

  it("parses a pasted listicle", () => {
    const text = `The 5 best coffee shops in Seattle right now.
1. Victrola Coffee – Capitol Hill
2) **Elm Coffee Roasters**: Pioneer Square
- Milstead & Co
• Victrola Coffee
https://example.com/article
We visited all of these over a long weekend and loved every single one of them.`;
    expect(parsePastedList(text)).toEqual([
      { name: "Victrola Coffee", note: "Capitol Hill" },
      { name: "Elm Coffee Roasters", note: "Pioneer Square" },
      { name: "Milstead & Co", note: null },
    ]);
  });
});

describe("dedupe with full addresses", () => {
  it("ignores city/state/ZIP after the street line", () => {
    expect(normalizeStreet("235 Summit Ave E, Seattle, WA 98102")).toBe("235 SUMMIT AVE E");
    expect(isSamePlace({ name: "Analog Coffee", address: "235 Summit Ave E" }, { name: "Analog Coffee", address: "235 Summit Ave E, Seattle, WA 98102" })).toBe(true);
  });
});
