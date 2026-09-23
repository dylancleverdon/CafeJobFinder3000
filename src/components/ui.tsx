import Link from "next/link";
import type { Category, Stage } from "@/db/schema";
import { CATEGORY_LABEL, STAGE_COLOR, STAGE_LABEL } from "@/lib/labels";
import { isNewOpening } from "@/lib/dates";

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <header className="mb-4 flex items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-muted">{subtitle}</p>}
      </div>
      {action}
    </header>
  );
}

export function StageChip({ stage }: { stage: Stage }) {
  return <span className={`chip ${STAGE_COLOR[stage].chip}`}>{STAGE_LABEL[stage]}</span>;
}

const CATEGORY_EMOJI: Record<Category, string> = { coffee: "☕", bakery: "🥯", tea: "🧋", other: "🥤" };

export function CategoryIcon({ category }: { category: Category }) {
  return (
    <span title={CATEGORY_LABEL[category]} aria-label={CATEGORY_LABEL[category]}>
      {CATEGORY_EMOJI[category]}
    </span>
  );
}

export function Badges({
  cafe,
  now,
}: {
  cafe: { isChain: boolean; hiringSign: boolean; mayHaveClosed: boolean; licenseStartDate: string | null; pinQuality: string };
  now: Date;
}) {
  return (
    <>
      {cafe.hiringSign && <span className="chip bg-emerald-100 text-emerald-900 dark:bg-emerald-900 dark:text-emerald-100">Now hiring sign</span>}
      {isNewOpening(cafe.licenseStartDate, now) && <span className="chip bg-fuchsia-100 text-fuchsia-900 dark:bg-fuchsia-900 dark:text-fuchsia-100">New opening</span>}
      {cafe.isChain && <span className="chip bg-stone-200 text-stone-700 dark:bg-stone-700 dark:text-stone-200">Chain</span>}
      {cafe.mayHaveClosed && <span className="chip bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-200">May have closed</span>}
      {cafe.pinQuality !== "exact" && <span className="chip border border-dashed border-line text-muted">{cafe.pinQuality === "approximate" ? "Approx. pin" : "No pin"}</span>}
    </>
  );
}

export function Stars({ value }: { value: number }) {
  if (!value) return null;
  return (
    <span className="text-xs text-amber-600" aria-label={`${value} of 5 stars`}>
      {"★".repeat(value)}
    </span>
  );
}

export function EmptyState({ title, children, href, cta }: { title: string; children?: React.ReactNode; href?: string; cta?: string }) {
  return (
    <div className="card p-5 text-center">
      <p className="font-semibold">{title}</p>
      {children && <div className="mt-1 text-sm text-muted">{children}</div>}
      {href && cta && (
        <Link href={href} className="btn-primary mt-4">
          {cta}
        </Link>
      )}
    </div>
  );
}
