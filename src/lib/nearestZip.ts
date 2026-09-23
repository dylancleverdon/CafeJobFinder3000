import centroids from "@/data/wa-zip-centroids.json";
import { haversine, type LatLng } from "./route/geo";

const table = Object.entries(centroids as unknown as Record<string, [number, number]>);

/** The ZIP whose center is closest to a point — good enough to file a spotted cafe under a neighborhood. */
export function nearestZip(p: LatLng, among?: ReadonlySet<string>): string | null {
  let best: string | null = null;
  let bestD = Infinity;
  for (const [zip, [lat, lng]] of table) {
    if (among && !among.has(zip)) continue;
    const d = haversine(p, { lat, lng });
    if (d < bestD) {
      bestD = d;
      best = zip;
    }
  }
  return best;
}
