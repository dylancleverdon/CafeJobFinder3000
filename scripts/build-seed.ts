/**
 * Builds the starter cafe list from Seattle's business-license export.
 *
 *   npm run seed:build -- data/raw/Active_Business_License_Tax_Certificate_YYYYMMDD.csv
 *
 * Writes src/data/seattle-cafes.seed.json (committed) and
 * src/data/wa-zip-centroids.json (ZIP → center point, for approximate pins).
 */
import fs from "node:fs";
import path from "node:path";
import Papa from "papaparse";
import { createRequire } from "node:module";
import { filterSeattleLicenses, type LicenseRow } from "../src/lib/import/seattleLicense";

const require = createRequire(import.meta.url);

const input =
  process.argv[2] ??
  fs
    .readdirSync("data/raw")
    .filter((f) => f.toLowerCase().endsWith(".csv"))
    .map((f) => path.join("data/raw", f))
    .sort()
    .pop();
if (!input) throw new Error("Pass the license CSV path (or put it in data/raw/)");

const csv = fs.readFileSync(input, "utf8");
const parsed = Papa.parse<LicenseRow>(csv, { header: true, skipEmptyLines: true });
const { candidates, stats } = filterSeattleLicenses(parsed.data);
const sourceDate = /(\d{8})/.exec(path.basename(input))?.[1] ?? null;

fs.writeFileSync(
  "src/data/seattle-cafes.seed.json",
  JSON.stringify({ source: path.basename(input), sourceDate, stats, cafes: candidates }, null, 0) + "\n",
);

// ZIP centers for Washington (offline data from the `zipcodes` package).
const zipcodes = require("zipcodes") as { lookupByState: (s: string) => { zip: string; latitude: number; longitude: number }[] };
const centroids: Record<string, [number, number]> = {};
for (const z of zipcodes.lookupByState("WA")) centroids[z.zip] = [z.latitude, z.longitude];
fs.writeFileSync("src/data/wa-zip-centroids.json", JSON.stringify(centroids) + "\n");

const missingZip = candidates.filter((c) => !c.zip || !centroids[c.zip]).length;
console.log(`Read ${stats.totalRows} license rows from ${input}`);
console.log(`Kept ${stats.kept}:`, stats.byCategory);
console.log(`Dropped: ${stats.outsideSeattle} outside Seattle, ${stats.corporateOffices} corporate offices, ${stats.duplicates} duplicates`);
console.log(`ZIP centers: ${Object.keys(centroids).length} WA ZIPs; ${missingZip} cafes without a known ZIP center`);
