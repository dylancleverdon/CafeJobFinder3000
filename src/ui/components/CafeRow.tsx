import type { Cafe } from "@/lib/types";
import { relativeDay } from "@/lib/dates";
import { neighborhoodName } from "@/lib/neighborhoods";
import { NavButton } from "../router";
import { Badges, CategoryIcon, StageChip, Stars } from "./ui";

export default function CafeRow({ cafe, now, showDue = true, showArea = false }: { cafe: Cafe; now: Date; showDue?: boolean; showArea?: boolean }) {
  return (
    <NavButton to={{ name: "cafe", id: cafe.id }} className="card flex w-full items-start gap-3 p-3 text-left active:bg-accent-soft" aria-label={cafe.name}>
      <div className="mt-0.5 text-xl leading-none">
        <CategoryIcon category={cafe.category} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold">{cafe.name}</p>
        {cafe.address && (
          <p className="truncate text-sm text-muted">
            {cafe.address}
            {showArea && cafe.zip ? ` · ${neighborhoodName(cafe.zip)}` : ""}
          </p>
        )}
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
    </NavButton>
  );
}
