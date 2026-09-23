"use client";

import { useState } from "react";
import { pinNextBatch, retryUnpinned } from "@/app/actions";

type Progress = { total: number; exact: number; pending: number };

export default function PinsPanel({ initial }: { initial: Progress }) {
  const [p, setP] = useState(initial);
  const [running, setRunning] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const run = async () => {
    setRunning(true);
    setMsg(null);
    let matchedTotal = 0;
    let exact = p.exact;
    try {
      for (;;) {
        const r = await pinNextBatch();
        if (r.error) {
          setMsg(`The Census address lookup didn't answer (${r.error}). Try again in a bit.`);
          break;
        }
        matchedTotal += r.matched;
        exact += r.matched;
        setP((x) => ({ ...x, exact, pending: r.remaining }));
        if (!r.remaining || !r.tried) break;
      }
      setMsg((m) => m ?? `Done — ${matchedTotal} places got exact pins.`);
    } finally {
      setRunning(false);
    }
  };

  const unmatched = p.total - p.exact - p.pending;
  const pct = p.total ? Math.round((p.exact / p.total) * 100) : 0;

  return (
    <section id="pins" className="card mb-4 scroll-mt-4 p-4">
      <h2 className="font-semibold">Map pins</h2>
      <p className="mt-1 text-sm text-muted">
        The Seattle list has street addresses but no map coordinates. This looks each address up once with the U.S. Census Bureau&apos;s free public address
        lookup (no account or key). Until then, places sit at the center of their ZIP code.
      </p>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-accent-soft">
        <div className="h-full bg-accent transition-all" style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-1 text-xs text-muted" data-testid="pin-progress">
        {p.exact} of {p.total} exact{p.pending ? ` · ${p.pending} to look up` : ""}
        {unmatched > 0 ? ` · ${unmatched} not found (fix those with “I'm here” or a Maps link)` : ""}
      </p>
      <div className="mt-3 flex gap-2">
        <button className="btn-primary flex-1" disabled={running || !p.pending} onClick={run}>
          {running ? `Looking up… ${p.pending} left` : p.pending ? "Get exact map pins" : "All looked up ✓"}
        </button>
        {!p.pending && unmatched > 0 && (
          <button
            className="btn-ghost"
            disabled={running}
            onClick={async () => {
              await retryUnpinned();
              setP((x) => ({ ...x, pending: x.total - x.exact }));
            }}
          >
            Retry
          </button>
        )}
      </div>
      {msg && <p className="mt-2 text-sm text-muted">{msg}</p>}
    </section>
  );
}
