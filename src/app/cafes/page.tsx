import { getSettings, listCafesLite } from "@/lib/server/queries";
import CafeBrowser from "./CafeBrowserLoader";

export const dynamic = "force-dynamic";

export default async function CafesPage() {
  const [cafes, settings] = await Promise.all([listCafesLite(), getSettings()]);
  const home = settings.homeLat != null && settings.homeLng != null ? { lat: settings.homeLat, lng: settings.homeLng } : null;
  return <CafeBrowser cafes={cafes} home={home} />;
}
