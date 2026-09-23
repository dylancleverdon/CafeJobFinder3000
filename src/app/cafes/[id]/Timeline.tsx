"use client";

import { useState, useTransition } from "react";
import { addLogEntry, deleteLogEntry } from "@/app/actions";
import type { InteractionType } from "@/db/schema";

type Entry = { id: number; at: string; type: InteractionType; contactName: string | null; outcome: string | null; note: string | null };

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

export default function Timeline({ cafeId, entries }: { cafeId: number; entries: Entry[] }) {
  const [pending, start] = useTransition();
  const [type, setType] = useState<InteractionType>("note");
  const [text, setText] = useState("");
  const [who, setWho] = useState("");

  return (
    <section className="card mb-4 p-4">
      <h2 className="mb-2 font-semibold">History</h2>
      <form
        className="mb-3 space-y-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!text.trim()) return;
          start(async () => {
            await addLogEntry(cafeId, type, text, who);
            setText("");
            setWho("");
          });
        }}
      >
        <div className="flex gap-2">
          <select className="input w-36 shrink-0 text-sm" value={type} onChange={(e) => setType(e.target.value as InteractionType)} aria-label="Entry type">
            <option value="note">Note</option>
            <option value="call">Call</option>
            <option value="email">Email</option>
            <option value="dm">Instagram DM</option>
            <option value="walk_in">Walk-in</option>
            <option value="follow_up">Follow-up</option>
          </select>
          <input className="input" placeholder="Who (optional)" value={who} onChange={(e) => setWho(e.target.value)} />
        </div>
        <div className="flex gap-2">
          <input className="input" placeholder="Add a note…" value={text} onChange={(e) => setText(e.target.value)} />
          <button className="btn-primary" disabled={pending || !text.trim()}>
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
                <button className="text-xs text-muted" onClick={() => confirm("Delete this entry?") && start(() => deleteLogEntry(e.id))} aria-label="Delete entry">
                  ✕
                </button>
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
