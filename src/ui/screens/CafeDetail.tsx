import { useState } from "react";
import { Badges, CategoryIcon, CopyText, EmptyState, StageChip } from "../components/ui";
import { useNav } from "../router";
import { useAppState } from "../useStore";
import { CATEGORY_LABEL } from "@/lib/labels";
import { relativeDay } from "@/lib/dates";
import { googleMapsSearchUrl } from "@/lib/text";
import { neighborhoodName } from "@/lib/neighborhoods";
import { directionsUrl } from "@/lib/route/areaPlan";
import QuickLog from "./cafe/QuickLog";
import Timeline from "./cafe/Timeline";
import Details from "./cafe/Details";
import Photos from "./cafe/Photos";
import InterestStars from "./cafe/InterestStars";
import LocationFix from "./cafe/LocationFix";

export default function CafeDetail({ id }: { id: string }) {
  const { byId } = useAppState();
  const nav = useNav();
  const [now] = useState(() => new Date());
  const [saved, setSaved] = useState(false);
  const cafe = byId.get(id);
  if (!cafe) {
    return (
      <EmptyState title="That cafe is gone" action={<button className="btn-ghost" onClick={nav.back}>Back</button>}>
        It may have been deleted.
      </EmptyState>
    );
  }
  const stop = { ...cafe, exact: cafe.pinQuality === "exact" };
  const check = cafe.googleMapsUrl ?? googleMapsSearchUrl([cafe.name, cafe.address, `Seattle, WA ${cafe.zip ?? ""}`.trim()].filter(Boolean).join(", "));

  return (
    <>
      <button type="button" onClick={nav.back} className="mb-3 inline-block text-sm font-semibold text-accent">
        ← Back
      </button>

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
            <p className="text-xs text-muted">
              {CATEGORY_LABEL[cafe.category]} · {neighborhoodName(cafe.zip)}
              {cafe.licenseStartDate ? ` · licensed since ${cafe.licenseStartDate.slice(0, 4)}` : ""}
            </p>
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

      <div className="mb-3 grid grid-cols-3 gap-2 text-center text-xs font-semibold">
        <a className="card flex flex-col items-center gap-1 py-2.5" href={directionsUrl(stop, "walk")} target="_blank" rel="noreferrer">
          <span className="text-lg" aria-hidden>🚶</span>Walk there
        </a>
        <a className="card flex flex-col items-center gap-1 py-2.5" href={directionsUrl(stop, "drive")} target="_blank" rel="noreferrer">
          <span className="text-lg" aria-hidden>🚗</span>Drive there
        </a>
        <a className="card flex flex-col items-center gap-1 py-2.5" href={check} target="_blank" rel="noreferrer">
          <span className="text-lg" aria-hidden>🗺️</span>Hours & photos
        </a>
      </div>
      {cafe.phone && (
        <div className="mb-4">
          <CopyText text={cafe.phone} label="📞" />
        </div>
      )}

      {cafe.mayHaveClosed && (
        <p className="card mb-4 border-red-300 p-3 text-sm">
          This place dropped off the latest Seattle license list — it may have closed. Tap <b>Hours & photos</b> to check on Google Maps.
        </p>
      )}
      {cafe.source === "license" && !cafe.mayHaveClosed && cafe.stage === "discovered" && (
        <p className="mb-4 text-xs text-muted">From Seattle&apos;s business-license list. Occasionally that address is an office, not the shop — tap Hours & photos to confirm.</p>
      )}

      <QuickLog cafeId={cafe.id} stage={cafe.stage} />
      <Timeline cafeId={cafe.id} entries={cafe.log} />
      {/* Re-open the form when the next-step date changes elsewhere (e.g. after logging a visit). */}
      <Details key={`${cafe.id}:${cafe.nextActionAt ?? ""}`} cafe={cafe} saved={saved} setSaved={setSaved} />
      <LocationFix cafe={cafe} />
      <Photos cafeId={cafe.id} />
    </>
  );
}
