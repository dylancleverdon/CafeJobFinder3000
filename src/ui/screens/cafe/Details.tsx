import { useState } from "react";
import { CATEGORIES, STAGES, type Cafe, type Category, type Stage } from "@/lib/types";
import { CATEGORY_LABEL, STAGE_LABEL } from "@/lib/labels";
import { toDateInput } from "@/lib/dates";
import { ConfirmButton } from "../../components/ui";
import { useNav } from "../../router";
import { useStoreApi } from "../../useStore";

function instagramUrl(handle: string) {
  if (/^https?:\/\//.test(handle)) return handle;
  return `https://instagram.com/${handle.replace(/^@/, "")}`;
}

export default function Details({ cafe, saved, setSaved }: { cafe: Cafe; saved: boolean; setSaved: (v: boolean) => void }) {
  const store = useStoreApi();
  const nav = useNav();
  const initial = {
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
  };
  const [form, setForm] = useState(initial);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setSaved(false);
    setForm((f) => ({ ...f, [k]: e.target.value }));
  };

  return (
    <section className="card mb-4 p-4">
      <h2 className="mb-3 font-semibold">Details</h2>
      <form
        className="space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          // Only send what you changed, so nothing else gets overwritten.
          const changed = Object.fromEntries(Object.entries(form).filter(([k, v]) => v !== initial[k as keyof typeof initial]));
          if ("nextActionAt" in changed) changed.nextActionAt = form.nextActionAt || (null as unknown as string);
          if (Object.keys(changed).length) await store.updateCafe(cafe.id, changed);
          setSaved(true);
        }}
      >
        <div className="grid grid-cols-2 gap-2">
          <label>
            <span className="label">Manager / contact</span>
            <input id="d-manager" className="input" value={form.managerName} onChange={set("managerName")} placeholder="Sam" />
          </label>
          <label>
            <span className="label">Best time to visit</span>
            <input id="d-best" className="input" value={form.bestTimeNote} onChange={set("bestTimeNote")} placeholder="Weekdays after 2" />
          </label>
        </div>
        <label className="block">
          <span className="label">Notes</span>
          <textarea id="d-notes" className="input min-h-24 py-2" value={form.notes} onChange={set("notes")} placeholder="Roaster, espresso machine, vibe, what they're looking for…" />
        </label>
        <label className="block">
          <span className="label">Next step date</span>
          <input id="d-next" type="date" className="input" value={form.nextActionAt} onChange={set("nextActionAt")} />
        </label>
        <details>
          <summary className="cursor-pointer text-sm text-muted">Contact info, name & address</summary>
          <div className="mt-3 space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <label>
                <span className="label">Instagram</span>
                <input id="d-ig" className="input" value={form.instagram} onChange={set("instagram")} placeholder="@cafe" autoCapitalize="off" />
              </label>
              <label>
                <span className="label">Phone</span>
                <input id="d-phone" className="input" type="tel" value={form.phone} onChange={set("phone")} />
              </label>
            </div>
            <label className="block">
              <span className="label">Website</span>
              <input id="d-web" className="input" type="url" value={form.website} onChange={set("website")} placeholder="https://" />
            </label>
            <label className="block">
              <span className="label">Name</span>
              <input id="d-name" className="input" value={form.name} onChange={set("name")} required />
            </label>
            <div className="grid grid-cols-[1fr_6rem] gap-2">
              <label>
                <span className="label">Street address</span>
                <input id="d-address" className="input" value={form.address} onChange={set("address")} />
              </label>
              <label>
                <span className="label">ZIP</span>
                <input id="d-zip" className="input" value={form.zip} onChange={set("zip")} inputMode="numeric" />
              </label>
            </div>
          </div>
        </details>
        <button className="btn-primary w-full">{saved ? "Saved ✓" : "Save details"}</button>
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
          <select id="d-stage" className="input text-sm" value={cafe.stage} onChange={(e) => store.updateCafe(cafe.id, { stage: e.target.value as Stage })}>
            {STAGES.map((s) => (
              <option key={s} value={s}>
                {STAGE_LABEL[s]}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="label">Type</span>
          <select id="d-category" className="input text-sm" value={cafe.category} onChange={(e) => store.updateCafe(cafe.id, { category: e.target.value as Category })}>
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
          <input id="d-hiring" type="checkbox" checked={cafe.hiringSign} onChange={(e) => store.updateCafe(cafe.id, { hiringSign: e.target.checked })} /> Now hiring sign
        </label>
        <label className="flex items-center gap-2">
          <input id="d-hidden" type="checkbox" checked={cafe.hidden} onChange={(e) => store.updateCafe(cafe.id, { hidden: e.target.checked })} /> Hide from lists
        </label>
      </div>
      <ConfirmButton
        className="mt-4 text-sm text-danger"
        label="Delete this cafe"
        confirmLabel={`Tap again to delete ${cafe.name}`}
        onConfirm={async () => {
          await store.deleteCafe(cafe.id);
          nav.back();
        }}
      />
    </section>
  );
}
