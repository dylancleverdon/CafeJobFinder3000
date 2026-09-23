import { useState } from "react";
import type { InteractionType, LogEntry } from "@/lib/types";
import { ConfirmButton } from "../../components/ui";
import { useStoreApi } from "../../useStore";

const TYPE_LABEL: Record<InteractionType, string> = {
  walk_in: "Walk-in",
  resume_drop: "Resume",
  follow_up: "Follow-up",
  call: "Call",
  email: "Email",
  dm: "Instagram DM",
  trial: "Trial",
  note: "Note",
  stage_change: "Update",
};

export default function Timeline({ cafeId, entries }: { cafeId: string; entries: LogEntry[] }) {
  const store = useStoreApi();
  const [type, setType] = useState<InteractionType>("note");
  const [text, setText] = useState("");
  const [who, setWho] = useState("");

  return (
    <section className="card mb-4 p-4">
      <h2 className="mb-2 font-semibold">History</h2>
      <form
        className="mb-3 space-y-2"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!text.trim()) return;
          await store.addLogEntry(cafeId, type, text, who);
          setText("");
          setWho("");
        }}
      >
        <div className="flex gap-2">
          <select id="log-type" className="input w-36 shrink-0 text-sm" value={type} onChange={(e) => setType(e.target.value as InteractionType)} aria-label="Entry type">
            <option value="note">Note</option>
            <option value="call">Call</option>
            <option value="email">Email</option>
            <option value="dm">Instagram DM</option>
            <option value="walk_in">Walk-in</option>
            <option value="follow_up">Follow-up</option>
          </select>
          <input id="log-who" className="input" placeholder="Who (optional)" value={who} onChange={(e) => setWho(e.target.value)} />
        </div>
        <div className="flex gap-2">
          <input id="log-text" className="input" placeholder="Add a note…" value={text} onChange={(e) => setText(e.target.value)} />
          <button className="btn-primary" disabled={!text.trim()}>
            Add
          </button>
        </div>
      </form>
      {entries.length === 0 ? (
        <p className="text-sm text-muted">No history yet.</p>
      ) : (
        <ol className="space-y-3 border-l-2 border-line pl-4">
          {entries.map((e) => (
            <li key={e.id} className="relative">
              <span className="absolute top-1.5 -left-[21px] h-2.5 w-2.5 rounded-full bg-accent" />
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-sm font-medium">
                  {TYPE_LABEL[e.type]}
                  {e.outcome ? ` · ${e.outcome}` : ""}
                </p>
                <ConfirmButton className="shrink-0 text-xs text-muted" label="✕" confirmLabel="Delete?" onConfirm={() => store.deleteLogEntry(cafeId, e.id)} />
              </div>
              <p className="text-xs text-muted">
                {new Date(e.at).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                {e.contactName ? ` · with ${e.contactName}` : ""}
              </p>
              {e.note && <p className="mt-0.5 text-sm whitespace-pre-wrap">{e.note}</p>}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
