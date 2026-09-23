import { zipCentroid } from "./geocode/zipCentroid";
import type { LatLng } from "./route/geo";

// Seattle ZIP codes → the neighborhoods people actually call them.
const NAMES: Record<string, string> = {
  "98101": "Downtown",
  "98102": "Capitol Hill / Eastlake",
  "98103": "Fremont / Wallingford / Greenwood",
  "98104": "Pioneer Square / Chinatown-ID",
  "98105": "U District / Laurelhurst",
  "98106": "Delridge / South Park",
  "98107": "Ballard",
  "98108": "Georgetown / Beacon Hill",
  "98109": "South Lake Union / Queen Anne",
  "98112": "Madison Park / Montlake",
  "98115": "Ravenna / Wedgwood / Maple Leaf",
  "98116": "West Seattle – Alki",
  "98117": "Ballard North / Crown Hill",
  "98118": "Columbia City / Rainier Valley",
  "98119": "Queen Anne / Interbay",
  "98121": "Belltown",
  "98122": "Capitol Hill / Central District",
  "98125": "Lake City / Northgate",
  "98126": "West Seattle – Junction / High Point",
  "98133": "Bitter Lake / Haller Lake",
  "98134": "SoDo",
  "98136": "West Seattle – Fauntleroy",
  "98144": "Mount Baker / North Beacon Hill",
  "98146": "White Center / Burien",
  "98154": "Downtown",
  "98161": "Downtown",
  "98164": "Downtown",
  "98174": "Downtown",
  "98177": "Broadview / Blue Ridge",
  "98178": "Rainier Beach / Skyway",
  "98195": "UW Campus",
  "98199": "Magnolia",
};

export function neighborhoodName(zip: string | null | undefined): string {
  const z = (zip ?? "").slice(0, 5);
  return NAMES[z] ?? (z ? `ZIP ${z}` : "Unknown area");
}

export function areaLabel(zip: string | null | undefined): string {
  const z = (zip ?? "").slice(0, 5);
  return z ? `${neighborhoodName(z)} · ${z}` : "Unknown area";
}

export function areaCenter(zip: string | null | undefined): LatLng | null {
  return zipCentroid(zip);
}
