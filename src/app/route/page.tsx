import { getSettings, listCafesLite } from "@/lib/server/queries";
import RoutePlanner from "./RoutePlannerLoader";

export const dynamic = "force-dynamic";

export default async function RoutePage({ searchParams }: { searchParams: Promise<{ ids?: string }> }) {
  const [{ ids }, cafes, s] = await Promise.all([searchParams, listCafesLite(), getSettings()]);
  return (
    <RoutePlanner
      cafes={cafes}
      home={s.homeLat != null && s.homeLng != null ? { lat: s.homeLat, lng: s.homeLng, label: s.homeLabel ?? "Home" } : null}
      window={{ start: s.windowStart, end: s.windowEnd }}
      dwellMinutes={s.dwellMinutes}
      preselected={ids ? ids.split(",").map(Number).filter(Number.isFinite) : []}
    />
  );
}
