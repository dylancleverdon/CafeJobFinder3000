import Link from "next/link";
import type { CafeLite } from "@/lib/server/queries";
import { Badges, CategoryIcon, StageChip, Stars } from "./ui";
import { relativeDay } from "@/lib/dates";
import { formatDistance } from "@/lib/route/geo";

export default function CafeRow({ cafe, now, distanceM, showDue = true }: { cafe: CafeLite; now: Date; distanceM?: number | null; showDue?: boolean }) {
  return (
    <Link href={`/cafes/${cafe.id}`} className="card flex items-start gap-3 p-3 active:bg-accent-soft">
      <div className="mt-0.5 text-xl leading-none">
        <CategoryIcon category={cafe.category} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <p className="truncate font-semibold">{cafe.name}</p>
          {distanceM != null && <span className="shrink-0 text-xs text-muted">{formatDistance(distanceM)}</span>}
        </div>
        {cafe.address && <p className="truncate text-sm text-muted">{cafe.address}</p>}
        <div className="mt-1.5 flex flex-wrap items-center gap-1">
          <StageChip stage={cafe.stage} />
          {showDue && cafe.nextActionAt && (
            <span className="chip bg-accent-soft text-ink">
              {cafe.stage === "trial" ? "Trial" : "Next"} {relativeDay(cafe.nextActionAt, now)}
            </span>
          )}
          <Stars value={cafe.interest} />
          <Badges cafe={cafe} now={now} />
        </div>
      </div>
    </Link>
  );
}
