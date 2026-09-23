import centroids from "@/data/wa-zip-centroids.json";
import type { LatLng } from "../route/geo";

const table = centroids as unknown as Record<string, [number, number]>;

/** Center of a ZIP code — an approximate pin until a real one is found. */
export function zipCentroid(zip: string | null | undefined): LatLng | null {
  const z = (zip ?? "").trim().slice(0, 5);
  const hit = table[z];
  return hit ? { lat: hit[0], lng: hit[1] } : null;
}
