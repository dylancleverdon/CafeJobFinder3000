import { useState } from "react";
import type { Stage } from "@/lib/types";
import { addDays, toDateInput } from "@/lib/dates";
import { NEEDS_DATE, QUICK_ACTION_LABEL, type QuickAction } from "@/lib/followup";
import { Toast } from "../../components/ui";
import { useStoreApi } from "../../useStore";

const PRIMARY: QuickAction[] = ["dropped_resume", "talked_to_manager", "not_hiring", "come_back"];
const SECONDARY: QuickAction[] = ["follow_up_no_answer", "trial_booked", "offer", "to_visit", "closed"];
const ICON: Record<QuickAction, string> = {
  dropped_resume: "📄",
  talked_to_manager: "🗣️",
  not_hiring: "🙅",
  come_back: "📅",
  follow_up_no_answer: "🔁",
  trial_booked: "🎯",
  offer: "🎉",
  to_visit: "📌",
  closed: "✖️",
};

export default function QuickLog({ cafeId, stage, compact = false, onDone }: { cafeId: string; stage: Stage; compact?: boolean; onDone?: (msg: string) => void }) {
  const store = useStoreApi();
  const [pending, setPending] = useState(false);
  const [picking, setPicking] = useState<QuickAction | null>(null);
  const [date, setDate] = useState(() => toDateInput(addDays(new Date(), 3)));
  const [contact, setContact] = useState("");
  const [note, setNote] = useState("");
  const [toast, setToast] = useState<{ text: string; ok: boolean } | null>(null);
  const [more, setMore] = useState(false);

  const run = async (action: QuickAction, withDate?: string) => {
    setPending(true);
    try {
      const res = await store.quickAction(cafeId, action, { date: withDate, contactName: contact, note });
      const when = res.nextActionAt ? new Date(res.nextActionAt).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }) : null;
      const msg = `${QUICK_ACTION_LABEL[action]} ✓${when ? ` · next step ${when}` : ""}`;
      setToast({ text: msg, ok: true });
      onDone?.(msg);
      setPicking(null);
      setContact("");
      setNote("");
    } catch (e) {
      setToast({ text: e instanceof Error ? e.message : "Something went wrong", ok: false });
    } finally {
      setPending(false);
    }
  };

  const tap = (a: QuickAction) => (NEEDS_DATE.has(a) ? setPicking(a) : run(a));
  const showAll = more || stage === "applied" || stage === "following_up" || stage === "trial";
  const buttons = showAll ? [...PRIMARY, ...SECONDARY] : PRIMARY;

  return (
    <section className={compact ? "" : "card mb-4 p-4"} aria-label="Log a visit">
      {!compact && <h2 className="mb-2 font-semibold">What happened?</h2>}
      <div className="grid grid-cols-2 gap-2">
        {buttons.map((a) => (
          <button key={a} type="button" className="btn-soft justify-start text-left" disabled={pending} onClick={() => tap(a)}>
            <span aria-hidden>{ICON[a]}</span>
            {QUICK_ACTION_LABEL[a]}
          </button>
        ))}
      </div>
      {!showAll && (
        <button type="button" className="mt-2 text-sm font-semibold text-accent" onClick={() => setMore(true)}>
          More options…
        </button>
      )}

      {picking && (
        <div className="mt-3 space-y-2 rounded-xl bg-accent-soft p-3">
          <label className="block">
            <span className="label">{picking === "trial_booked" ? "Trial / interview date" : "Come back on"}</span>
            <input id={`date-${cafeId}`} type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <div className="flex gap-2">
            <button type="button" className="btn-primary flex-1" disabled={pending || !date} onClick={() => run(picking, date)}>
              Save
            </button>
            <button type="button" className="btn-ghost" onClick={() => setPicking(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {!compact && (
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer text-muted">Add who you talked to / a note</summary>
          <div className="mt-2 space-y-2">
            <input id={`contact-${cafeId}`} className="input" placeholder="Who? e.g. Sam (manager)" value={contact} onChange={(e) => setContact(e.target.value)} />
            <textarea
              id={`note-${cafeId}`}
              className="input min-h-20 py-2"
              placeholder="Notes — they want weekend availability, ask for Sam after 2pm…"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            <p className="text-xs text-muted">Then tap what happened above — the note is saved with it.</p>
          </div>
        </details>
      )}

      {toast && <Toast tone={toast.ok ? "good" : "bad"}>{toast.text}</Toast>}
    </section>
  );
}
