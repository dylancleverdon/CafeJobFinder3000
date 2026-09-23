import Link from "next/link";
import { notFound } from "next/navigation";
import { Badges, CategoryIcon, StageChip } from "@/components/ui";
import { getCafeDetail } from "@/lib/server/queries";
import { googleMapsSearchUrl } from "@/lib/text";
import { navigateUrl } from "@/lib/route/plan";
import { CATEGORY_LABEL } from "@/lib/labels";
import { relativeDay } from "@/lib/dates";
import QuickLog from "./QuickLog";
import CafeDetails from "./CafeDetails";
import LocationFix from "./LocationFix";
import Timeline from "./Timeline";
import Photos from "./Photos";
import InterestStars from "./InterestStars";

export const dynamic = "force-dynamic";
// Fixing a pin from a Google Maps short link calls out to Google — give it time.
export const maxDuration = 60;

export default async function CafePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const detail = await getCafeDetail(Number(id));
  if (!detail) notFound();
  const { cafe, log, photos } = detail;
  const now = new Date();
  const mapsUrl = cafe.googleMapsUrl ?? googleMapsSearchUrl([cafe.name, cafe.address, "Seattle, WA"].filter(Boolean).join(", "));
  const hasPin = cafe.lat != null && cafe.lng != null;
  const navTarget = hasPin && cafe.pinQuality === "exact" ? { lat: cafe.lat!, lng: cafe.lng! } : null;
  const navQuery = !navTarget ? googleMapsSearchUrl([cafe.name, cafe.address, "Seattle, WA"].filter(Boolean).join(", ")) : null;

  return (
    <>
      <Link href="/cafes" className="mb-3 inline-block text-sm font-semibold text-accent">
        ← Cafes
      </Link>

      <header className="mb-4">
        <div className="flex items-start gap-3">
          <div className="text-3xl leading-none">
            <CategoryIcon category={cafe.category} />
          </div>
          <div className="min-w-0">
            <h1 className="text-2xl leading-tight font-bold">{cafe.name}</h1>
            {cafe.address && (
              <p className="text-sm text-muted">
                {cafe.address}
                {cafe.zip && !cafe.address.includes(cafe.zip) ? `, ${cafe.zip}` : ""}
              </p>
            )}
            <p className="text-xs text-muted">{CATEGORY_LABEL[cafe.category]}{cafe.licenseStartDate ? ` · licensed since ${cafe.licenseStartDate.slice(0, 4)}` : ""}</p>
          </div>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-1">
          <StageChip stage={cafe.stage} />
          {cafe.nextActionAt && (
            <span className="chip bg-accent-soft text-ink">
              {cafe.stage === "trial" ? "Trial" : "Next step"} {relativeDay(cafe.nextActionAt, now)}
            </span>
          )}
          <Badges cafe={cafe} now={now} />
        </div>
        <div className="mt-2">
          <InterestStars cafeId={cafe.id} value={cafe.interest} />
        </div>
      </header>

      <div className="mb-4 grid grid-cols-4 gap-2 text-center text-xs font-semibold">
        <a className="card flex flex-col items-center gap-1 py-2.5" href={navTarget ? navigateUrl(navTarget, "walk") : navQuery!} target="_blank" rel="noreferrer">
          <span className="text-lg">🚶</span>Walk
        </a>
        <a className="card flex flex-col items-center gap-1 py-2.5" href={navTarget ? navigateUrl(navTarget, "drive") : navQuery!} target="_blank" rel="noreferrer">
          <span className="text-lg">🚗</span>Drive
        </a>
        {cafe.phone ? (
          <a className="card flex flex-col items-center gap-1 py-2.5" href={`tel:${cafe.phone.replace(/[^\d+]/g, "")}`}>
            <span className="text-lg">📞</span>Call
          </a>
        ) : (
          <span className="card flex flex-col items-center gap-1 py-2.5 text-muted opacity-60">
            <span className="text-lg">📞</span>No phone
          </span>
        )}
        <a className="card flex flex-col items-center gap-1 py-2.5" href={mapsUrl} target="_blank" rel="noreferrer">
          <span className="text-lg">🗺️</span>Check
        </a>
      </div>

      {cafe.mayHaveClosed && (
        <p className="card mb-4 border-red-300 p-3 text-sm">
          This place dropped off the latest Seattle license list — it may have closed. Tap <b>Check</b> to see it on Google Maps.
        </p>
      )}
      {cafe.source === "license" && !cafe.mayHaveClosed && cafe.stage === "discovered" && (
        <p className="mb-4 text-xs text-muted">From Seattle&apos;s business-license list. Occasionally that address is an office, not the shop — tap Check to confirm.</p>
      )}

      <QuickLog cafeId={cafe.id} stage={cafe.stage} />

      <Timeline cafeId={cafe.id} entries={log.map((l) => ({ ...l, at: l.at.toISOString() }))} />

      <CafeDetails cafe={{ ...cafe, nextActionAt: cafe.nextActionAt?.toISOString() ?? null, createdAt: cafe.createdAt.toISOString(), updatedAt: cafe.updatedAt.toISOString() }} />

      <LocationFix cafeId={cafe.id} pinQuality={cafe.pinQuality} lat={cafe.lat} lng={cafe.lng} name={cafe.name} />

      <Photos cafeId={cafe.id} photos={photos.map((p) => ({ id: p.id, dataUrl: p.dataUrl, takenAt: p.takenAt.toISOString() }))} />
    </>
  );
}
