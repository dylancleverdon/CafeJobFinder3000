import { useMemo } from "react";
import CafeRow from "../components/CafeRow";
import { PageHeader } from "../components/ui";
import { NavButton } from "../router";
import { useAppState } from "../useStore";
import { todayView } from "@/store/store";
import { relativeDay } from "@/lib/dates";

export default function Today() {
  const { cafes, settings } = useAppState();
  const now = useMemo(() => new Date(), []);
  const v = useMemo(() => todayView(cafes, now), [cafes, now]);
  const goal = settings.weeklyGoal;
  const pct = Math.min(100, Math.round((v.weekCount / Math.max(goal, 1)) * 100));
  const greeting = now.getHours() < 12 ? "Good morning" : now.getHours() < 17 ? "Good afternoon" : "Good evening";

  return (
    <>
      <PageHeader title={greeting} subtitle={now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })} />

      <section className="card mb-4 p-4">
        <div className="flex items-baseline justify-between">
          <p className="font-semibold">This week</p>
          <p className="text-sm text-muted">
            <span className="text-lg font-bold text-ink tabular-nums">{v.weekCount}</span> / {goal} cafes
          </p>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-accent-soft" role="progressbar" aria-valuenow={v.weekCount} aria-valuemax={goal} aria-label="Cafes contacted this week">
          <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${pct}%` }} />
        </div>
        <div className="mt-3 flex gap-2">
          <NavButton to={{ name: "route" }} className="btn-primary flex-1">
            Plan a walk-in day
          </NavButton>
          <NavButton to={{ name: "add", tab: "spotted" }} className="btn-ghost">
            📍 Spotted one
          </NavButton>
        </div>
      </section>

      {v.trials.length > 0 && (
        <section className="mb-5">
          <h2 className="mb-2 text-sm font-bold tracking-wide text-muted uppercase">🎯 Trials & interviews</h2>
          <div className="space-y-2">
            {v.trials.map((c) => (
              <CafeRow key={c.id} cafe={c} now={now} />
            ))}
          </div>
        </section>
      )}

      <section className="mb-5">
        <h2 className="mb-2 text-sm font-bold tracking-wide text-muted uppercase">Follow up today {v.due.length > 0 && `(${v.due.length})`}</h2>
        {v.due.length ? (
          <div className="space-y-2">
            {v.due.map((c) => (
              <CafeRow key={c.id} cafe={c} now={now} />
            ))}
          </div>
        ) : (
          <p className="card p-4 text-sm text-muted">Nothing due. A good day to walk into somewhere new ☕</p>
        )}
      </section>

      {v.upcoming.length > 0 && (
        <section className="mb-5">
          <h2 className="mb-2 text-sm font-bold tracking-wide text-muted uppercase">Coming up this week</h2>
          <div className="space-y-2">
            {v.upcoming.slice(0, 5).map((c) => (
              <CafeRow key={c.id} cafe={c} now={now} />
            ))}
          </div>
        </section>
      )}

      {v.toVisit.length > 0 && (
        <section className="mb-5">
          <h2 className="mb-2 text-sm font-bold tracking-wide text-muted uppercase">On your visit list</h2>
          <div className="space-y-2">
            {v.toVisit.map((c) => (
              <CafeRow key={c.id} cafe={c} now={now} showDue={false} />
            ))}
          </div>
        </section>
      )}

      {v.recent.length > 0 && (
        <section className="mb-5">
          <h2 className="mb-2 text-sm font-bold tracking-wide text-muted uppercase">Recent activity</h2>
          <ul className="card divide-y divide-line">
            {v.recent.map((r) => (
              <li key={r.id}>
                <NavButton to={{ name: "cafe", id: r.cafeId }} className="flex w-full justify-between gap-3 px-4 py-2.5 text-left text-sm">
                  <span className="min-w-0 truncate">
                    <span className="font-medium">{r.cafeName}</span> <span className="text-muted">· {r.outcome ?? r.note ?? r.type.replace("_", " ")}</span>
                  </span>
                  <span className="shrink-0 text-xs text-muted">{relativeDay(r.at, now)}</span>
                </NavButton>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="text-center text-xs text-muted">
        {v.total} places tracked · {v.active} in progress
      </p>
    </>
  );
}
