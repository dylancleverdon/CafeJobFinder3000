import Link from "next/link";
import CafeRow from "@/components/CafeRow";
import { PageHeader } from "@/components/ui";
import { getSettings, getTodayData } from "@/lib/server/queries";
import { relativeDay } from "@/lib/dates";
import FirstRun from "./FirstRun";

export const dynamic = "force-dynamic";

export default async function TodayPage() {
  const now = new Date();
  const [data, settings] = await Promise.all([getTodayData(now), getSettings()]);
  const { due, trials, toVisit, weekCount, counts, recent } = data;
  const goal = settings.weeklyGoal;
  const pct = Math.min(100, Math.round((weekCount / Math.max(goal, 1)) * 100));
  const greeting = now.getHours() < 12 ? "Good morning" : now.getHours() < 17 ? "Good afternoon" : "Good evening";

  if (counts.total === 0) {
    return (
      <>
        <PageHeader title={greeting} subtitle="Let's find you a barista job." />
        <FirstRun />
      </>
    );
  }

  return (
    <>
      <PageHeader title={greeting} subtitle={now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })} />

      <section className="card mb-4 p-4">
        <div className="flex items-baseline justify-between">
          <p className="font-semibold">This week</p>
          <p className="text-sm text-muted">
            <span className="text-lg font-bold text-ink">{weekCount}</span> / {goal} cafes
          </p>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-accent-soft" role="progressbar" aria-valuenow={weekCount} aria-valuemax={goal}>
          <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${pct}%` }} />
        </div>
        <div className="mt-3 flex gap-2">
          <Link href="/route" className="btn-primary flex-1">
            Plan a walk-in route
          </Link>
          <Link href="/add?tab=spotted" className="btn-ghost">
            📍 Spotted one
          </Link>
        </div>
        {counts.needPins > 0 && (
          <p className="mt-3 text-xs text-muted">
            {counts.needPins} cafes still have approximate pins.{" "}
            <Link href="/settings#pins" className="font-semibold text-accent underline">
              Get exact map pins
            </Link>
          </p>
        )}
      </section>

      {trials.length > 0 && (
        <section className="mb-5">
          <h2 className="mb-2 text-sm font-bold tracking-wide text-muted uppercase">🎯 Trials & interviews</h2>
          <div className="space-y-2">
            {trials.map((c) => (
              <CafeRow key={c.id} cafe={c} now={now} />
            ))}
          </div>
        </section>
      )}

      <section className="mb-5">
        <h2 className="mb-2 text-sm font-bold tracking-wide text-muted uppercase">Follow up today {due.length > 0 && `(${due.length})`}</h2>
        {due.length ? (
          <div className="space-y-2">
            {due.map((c) => (
              <CafeRow key={c.id} cafe={c} now={now} />
            ))}
          </div>
        ) : (
          <p className="card p-4 text-sm text-muted">Nothing due. A good day to walk into somewhere new ☕</p>
        )}
      </section>

      {toVisit.length > 0 && (
        <section className="mb-5">
          <h2 className="mb-2 text-sm font-bold tracking-wide text-muted uppercase">On your visit list</h2>
          <div className="space-y-2">
            {toVisit.map((c) => (
              <CafeRow key={c.id} cafe={c} now={now} showDue={false} />
            ))}
          </div>
        </section>
      )}

      {recent.length > 0 && (
        <section className="mb-5">
          <h2 className="mb-2 text-sm font-bold tracking-wide text-muted uppercase">Recent activity</h2>
          <ul className="card divide-y divide-line">
            {recent.map((r) => (
              <li key={r.id}>
                <Link href={`/cafes/${r.cafeId}`} className="flex justify-between gap-3 px-4 py-2.5 text-sm">
                  <span className="min-w-0 truncate">
                    <span className="font-medium">{r.cafeName}</span> <span className="text-muted">· {r.outcome ?? r.type.replace("_", " ")}</span>
                  </span>
                  <span className="shrink-0 text-xs text-muted">{relativeDay(r.at, now)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="text-center text-xs text-muted">
        {counts.total} places tracked · {counts.active} in progress
      </p>
    </>
  );
}
