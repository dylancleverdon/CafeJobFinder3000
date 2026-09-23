import { haversine, type LatLng } from "./geo";

export type TravelMode = "walk" | "drive";

// No routing service: straight-line distance × a detour factor for real streets.
export const TRAVEL = {
  walk: { kmh: 4.8, detour: 1.3, overheadMin: 0 },
  drive: { kmh: 30, detour: 1.4, overheadMin: 5 }, // +5 min to park
} as const;

export function travel(a: LatLng, b: LatLng, mode: TravelMode): { meters: number; minutes: number } {
  const t = TRAVEL[mode];
  const meters = haversine(a, b) * t.detour;
  const minutes = meters / ((t.kmh * 1000) / 60) + (meters > 0 ? t.overheadMin : 0);
  return { meters, minutes };
}
