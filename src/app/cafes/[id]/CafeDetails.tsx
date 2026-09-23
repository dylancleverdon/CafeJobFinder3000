"use client";

import { useState, useTransition } from "react";
import { deleteCafe, updateCafe, type CafePatch } from "@/app/actions";
import { CATEGORIES, STAGES, type Cafe } from "@/db/schema";
import { CATEGORY_LABEL, STAGE_LABEL } from "@/lib/labels";
import { toDateInput } from "@/lib/dates";

type CafeJson = Omit<Cafe, "nextActionAt" | "createdAt" | "updatedAt"> & { nextActionAt: string | null; createdAt: string; updatedAt: string };

function instagramUrl(handle: string) {
  if (/^https?:\/\//.test(handle)) return handle;
  return `https://instagram.com/${handle.replace(/^@/, "")}`;
}

export default function CafeDetails({ cafe }: { cafe: CafeJson }) {
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState(false);
  const [form, setForm] = useState({
    managerName: cafe.managerName ?? "",
    bestTimeNote: cafe.bestTimeNote ?? "",
    notes: cafe.notes ?? "",
    instagram: cafe.instagram ?? "",
    website: cafe.website ?? "",
    phone: cafe.phone ?? "",
    name: cafe.name,
    address: cafe.address ?? "",
    zip: cafe.zip ?? "",
    nextActionAt: cafe.nextActionAt ? toDateInput(new Date(cafe.nextActionAt)) : "",
  });
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setSaved(false);
    setForm((f) => ({ ...f, [k]: e.target.value }));
  };
  const save = (patch: CafePatch) =>
    start(async () => {
      await updateCafe(cafe.id, patch);
      setSaved(true);
    });

  return (
    <section className="card mb-4 p-4">
      <h2 className="mb-3 font-semibold">Details</h2>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          save({ ...form, nextActionAt: form.nextActionAt || null });
        }}
      >
        <div className="grid grid-cols-2 gap-2">
          <label>
            <span className="label">Manager / contact</span>
            <input className="input" value={form.managerName} onChange={set("managerName")} placeholder="Sam" />
          </label>
          <label>
            <span className="label">Best time to visit</span>
            <input className="input" value={form.bestTimeNote} onChange={set("bestTimeNote")} placeholder="Weekdays after 2" />
          </label>
        </div>
        <label className="block">
          <span className="label">Notes</span>
          <textarea className="input min-h-24 py-2" value={form.notes} onChange={set("notes")} placeholder="Roaster, espresso machine, vibe, what they're looking for…" />
        </label>
        <label className="block">
          <span className="label">Next step date</span>
          <input type="date" className="input" value={form.nextActionAt} onChange={set("nextActionAt")} />
        </label>
        <details>
          <summary className="cursor-pointer text-sm text-muted">Contact info, name & address</summary>
          <div className="mt-3 space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <label>
                <span className="label">Instagram</span>
                <input className="input" value={form.instagram} onChange={set("instagram")} placeholder="@cafe" autoCapitalize="off" />
              </label>
              <label>
                <span className="label">Phone</span>
                <input className="input" type="tel" value={form.phone} onChange={set("phone")} />
              </label>
            </div>
            <label className="block">
              <span className="label">Website</span>
              <input className="input" type="url" value={form.website} onChange={set("website")} placeholder="https://" />
            </label>
            <label className="block">
              <span className="label">Name</span>
              <input className="input" value={form.name} onChange={set("name")} required />
            </label>
            <div className="grid grid-cols-[1fr_6rem] gap-2">
              <label>
                <span className="label">Street address</span>
                <input className="input" value={form.address} onChange={set("address")} />
              </label>
              <label>
                <span className="label">ZIP</span>
                <input className="input" value={form.zip} onChange={set("zip")} inputMode="numeric" />
              </label>
            </div>
          </div>
        </details>
        <button className="btn-primary w-full" disabled={pending}>
          {pending ? "Saving…" : saved ? "Saved ✓" : "Save details"}
        </button>
      </form>

      {(cafe.instagram || cafe.website) && (
        <div className="mt-3 flex gap-2 text-sm">
          {cafe.instagram && (
            <a className="btn-ghost flex-1" href={instagramUrl(cafe.instagram)} target="_blank" rel="noreferrer">
              Instagram
            </a>
          )}
          {cafe.website && (
            <a className="btn-ghost flex-1" href={cafe.website} target="_blank" rel="noreferrer">
              Website
            </a>
          )}
        </div>
      )}

      <div className="mt-4 grid grid-cols-2 gap-2">
        <label>
          <span className="label">Stage</span>
          <select className="input text-sm" defaultValue={cafe.stage} onChange={(e) => save({ stage: e.target.value as CafePatch["stage"] })}>
            {STAGES.map((s) => (
              <option key={s} value={s}>
                {STAGE_LABEL[s]}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="label">Type</span>
          <select className="input text-sm" defaultValue={cafe.category} onChange={(e) => save({ category: e.target.value as CafePatch["category"] })}>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABEL[c]}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm">
        <label className="flex items-center gap-2">
          <input type="checkbox" defaultChecked={cafe.hiringSign} onChange={(e) => save({ hiringSign: e.target.checked })} /> Now hiring sign
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" defaultChecked={cafe.hidden} onChange={(e) => save({ hidden: e.target.checked })} /> Hide from lists
        </label>
      </div>
      <button className="mt-4 text-sm text-danger" onClick={() => confirm(`Delete ${cafe.name} and its history?`) && start(() => deleteCafe(cafe.id))}>
        Delete this cafe
      </button>
    </section>
  );
}
