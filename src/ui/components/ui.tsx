import { useEffect, useState } from "react";
import type { Category, Stage } from "@/lib/types";
import { CATEGORY_LABEL, STAGE_COLOR, STAGE_LABEL } from "@/lib/labels";
import { isNewOpening } from "@/lib/dates";

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <header className="mb-4 flex items-end justify-between gap-3">
      <div className="min-w-0">
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
    <span title={CATEGORY_LABEL[category]} aria-label={CATEGORY_LABEL[category]} role="img">
      {CATEGORY_EMOJI[category]}
    </span>
  );
}

export function Badges({
  cafe,
  now,
}: {
  cafe: { isChain: boolean; hiringSign: boolean; mayHaveClosed: boolean; licenseStartDate: string | null };
  now: Date;
}) {
  return (
    <>
      {cafe.hiringSign && <span className="chip bg-emerald-100 text-emerald-900 dark:bg-emerald-900 dark:text-emerald-100">Now hiring sign</span>}
      {isNewOpening(cafe.licenseStartDate, now) && <span className="chip bg-fuchsia-100 text-fuchsia-900 dark:bg-fuchsia-900 dark:text-fuchsia-100">New opening</span>}
      {cafe.isChain && <span className="chip bg-stone-200 text-stone-700 dark:bg-stone-700 dark:text-stone-200">Chain</span>}
      {cafe.mayHaveClosed && <span className="chip bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-200">May have closed</span>}
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

export function EmptyState({ title, children, action }: { title: string; children?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="card p-5 text-center">
      <p className="font-semibold">{title}</p>
      {children && <div className="mt-1 text-sm text-muted">{children}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/** Two-tap confirm (pop-up confirm dialogs don't work inside Claude). */
export function ConfirmButton({ label, confirmLabel, onConfirm, className }: { label: string; confirmLabel: string; onConfirm: () => void; className?: string }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(t);
  }, [armed]);
  return (
    <button
      type="button"
      className={`${className ?? ""} ${armed ? "font-semibold text-danger" : ""}`}
      onClick={() => {
        if (armed) {
          setArmed(false);
          onConfirm();
        } else setArmed(true);
      }}
    >
      {armed ? confirmLabel : label}
    </button>
  );
}

/** Shows text you can copy (phone numbers etc. — call links don't always work inside Claude). */
export function CopyText({ text, label }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="btn-ghost w-full justify-between"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          /* select-to-copy still works */
        }
      }}
    >
      <span className="select-all">{label ? `${label} ${text}` : text}</span>
      <span className="text-xs text-muted">{copied ? "Copied ✓" : "Copy"}</span>
    </button>
  );
}

export function Toast({ children, tone = "good" }: { children: React.ReactNode; tone?: "good" | "bad" }) {
  return (
    <p role="status" className={`mt-3 rounded-xl px-3 py-2 text-sm ${tone === "good" ? "bg-good-soft text-good" : "bg-red-50 text-danger dark:bg-red-950"}`}>
      {children}
    </p>
  );
}
