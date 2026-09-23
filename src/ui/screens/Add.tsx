import { useState } from "react";
import { PageHeader, Toast } from "../components/ui";
import { NavButton, useNav } from "../router";
import { useAppState, useStoreApi } from "../useStore";
import { CATEGORIES, type Category } from "@/lib/types";
import { CATEGORY_LABEL } from "@/lib/labels";
import { downscalePhoto } from "@/lib/client/photo";
import { areaLabel } from "@/lib/neighborhoods";
import type { Store } from "@/store/store";

type Tab = "link" | "spotted" | "manual";
type Result = { id: string; duplicate: boolean; pinUpdated?: boolean };

function CategorySelect({ id, value, onChange }: { id: string; value: Category; onChange: (c: Category) => void }) {
  return (
    <label className="block">
      <span className="label">Type</span>
      <select id={id} className="input" value={value} onChange={(e) => onChange(e.target.value as Category)}>
        {CATEGORIES.map((c) => (
          <option key={c} value={c}>
            {CATEGORY_LABEL[c]}
          </option>
        ))}
      </select>
    </label>
  );
}

function ZipSelect({ id, value, onChange }: { id: string; value: string; onChange: (z: string) => void }) {
  const { cafes } = useAppState();
  const zips = [...new Set(cafes.map((c) => c.zip).filter(Boolean) as string[])].sort();
  return (
    <label className="block">
      <span className="label">Neighborhood</span>
      <select id={id} className="input" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Not sure</option>
        {zips.map((z) => (
          <option key={z} value={z}>
            {areaLabel(z)}
          </option>
        ))}
      </select>
    </label>
  );
}

export default function Add({ initialTab = "link" }: { initialTab?: Tab }) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const store = useStoreApi();
  const nav = useNav();
  const [pending, setPending] = useState(false);
  const [dupe, setDupe] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);

  const save = async (fn: (s: Store) => Promise<Result>) => {
    setPending(true);
    setError(null);
    setDupe(null);
    try {
      const res = await fn(store);
      if (res.duplicate) setDupe(res);
      else nav.go({ name: "cafe", id: res.id });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save");
    } finally {
      setPending(false);
    }
  };

  return (
    <>
      <PageHeader title="Add a cafe" subtitle="From a Google Maps link, one you spotted, or typed in." />
      <div className="mb-4 grid grid-cols-3 rounded-xl border border-line bg-card p-0.5 text-sm font-semibold" role="tablist">
        {(
          [
            ["link", "🔗 Maps link"],
            ["spotted", "📍 Spotted"],
            ["manual", "✍️ Type it"],
          ] as const
        ).map(([t, label]) => (
          <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={`rounded-lg py-2 ${tab === t ? "bg-accent text-accent-ink" : "text-muted"}`}>
            {label}
          </button>
        ))}
      </div>

      {dupe && (
        <div className="card mb-4 p-4 text-sm" role="status">
          {dupe.pinUpdated ? "Already in your list — updated its map pin ✓ " : "That's already in your list. "}
          <NavButton to={{ name: "cafe", id: dupe.id }} className="font-semibold text-accent underline">
            Open it
          </NavButton>
        </div>
      )}
      {error && <p className="mb-3 text-sm text-danger">{error}</p>}

      {tab === "link" && <FromLink pending={pending} onSave={save} />}
      {tab === "spotted" && <Spotted pending={pending} onSave={save} />}
      {tab === "manual" && <Manual pending={pending} onSave={save} />}
    </>
  );
}

function FromLink({ pending, onSave }: { pending: boolean; onSave: (fn: (s: Store) => Promise<Result>) => void }) {
  const store = useStoreApi();
  const [text, setText] = useState("");
  const [place, setPlace] = useState<ReturnType<Store["readMapsLink"]> | null>(null);
  const [name, setName] = useState("");
  const [zip, setZip] = useState("");
  const [category, setCategory] = useState<Category>("coffee");

  const read = (value: string) => {
    const r = store.readMapsLink(value);
    setPlace(r);
    setName(r.name ?? "");
    setZip(/\b(9[89]\d{3})\b/.exec(r.address ?? "")?.[1] ?? "");
  };

  return (
    <div className="space-y-3">
      <div className="card space-y-3 p-4">
        <p className="text-sm text-muted">
          In Google Maps, open the cafe → <b>Share</b> → <b>Copy</b>, then paste it here. The more that comes with it (name, address) the better.
        </p>
        <textarea
          id="maps-text"
          className="input min-h-24 py-2"
          placeholder={"Victrola Coffee Roasters\n310 E Pike St, Seattle, WA 98122\nhttps://maps.app.goo.gl/…"}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onPaste={(e) => {
            const t = e.clipboardData.getData("text");
            if (t) setTimeout(() => read(t), 0);
          }}
        />
        <button type="button" className="btn-primary w-full" disabled={!text.trim()} onClick={() => read(text)}>
          Read it
        </button>
      </div>

      {place && (
        <div className="card space-y-3 p-4">
          {place.match && (
            <div className="rounded-xl bg-accent-soft p-3 text-sm">
              Looks like <b>{place.match.name}</b> ({place.match.address}) — already in your list.{" "}
              <NavButton to={{ name: "cafe", id: place.match.id }} className="font-semibold text-accent underline">
                Open it
              </NavButton>
            </div>
          )}
          {place.shortLinkOnly && !place.match && (
            <p className="text-sm text-muted">That&apos;s just a short link, so there&apos;s no name in it. Type the name below (and the neighborhood if you know it).</p>
          )}
          <label className="block">
            <span className="label">Name</span>
            <input id="link-name" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Cafe name" />
          </label>
          {place.address && <p className="text-sm text-muted">{place.address}</p>}
          {!place.address && <ZipSelect id="link-zip" value={zip} onChange={setZip} />}
          <p className="text-sm">{place.lat != null ? "📍 Exact location included" : "📍 Will be placed by neighborhood"}</p>
          <CategorySelect id="link-category" value={category} onChange={setCategory} />
          <button
            type="button"
            className="btn-primary w-full"
            disabled={pending || !name.trim()}
            onClick={() =>
              onSave((s) =>
                s.createCafe({
                  name,
                  address: place.address,
                  zip: zip || null,
                  lat: place.lat,
                  lng: place.lat != null ? place.lng : null,
                  exactPin: place.precision === "place",
                  googleMapsUrl: place.url,
                  category,
                  source: "gmaps",
                }),
              )
            }
          >
            {pending ? "Saving…" : "Save cafe"}
          </button>
        </div>
      )}
    </div>
  );
}

function Spotted({ pending, onSave }: { pending: boolean; onSave: (fn: (s: Store) => Promise<Result>) => void }) {
  const store = useStoreApi();
  const [name, setName] = useState("");
  const [where, setWhere] = useState("");
  const [zip, setZip] = useState("");
  const [hiring, setHiring] = useState(false);
  const [note, setNote] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);
  const [category, setCategory] = useState<Category>("coffee");

  return (
    <div className="card space-y-3 p-4">
      <p className="text-sm text-muted">Walking or driving past somewhere? Jot it down in a few seconds.</p>
      <label className="block">
        <span className="label">Name</span>
        <input id="spot-name" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="What's on the sign?" />
      </label>
      <label className="block">
        <span className="label">Where</span>
        <input id="spot-where" className="input" value={where} onChange={(e) => setWhere(e.target.value)} placeholder="Street address or cross streets" />
      </label>
      <ZipSelect id="spot-zip" value={zip} onChange={setZip} />
      <label className="flex items-center gap-3 rounded-xl border border-line p-3">
        <input id="spot-hiring" type="checkbox" className="h-5 w-5" checked={hiring} onChange={(e) => setHiring(e.target.checked)} />
        <span>
          <span className="font-semibold">“Now hiring” sign in the window</span>
          <span className="block text-xs text-muted">Moves it to the top of your list</span>
        </span>
      </label>
      <label className="btn-ghost w-full cursor-pointer">
        {photo ? "📷 Photo added — retake" : "📷 Snap the storefront"}
        <input
          id="spot-photo"
          type="file"
          accept="image/*"
          capture="environment"
          className="sr-only"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (f) setPhoto(await downscalePhoto(f));
          }}
        />
      </label>
      {photo && <img src={photo} alt="Storefront" className="max-h-48 w-full rounded-xl object-cover" />}
      <CategorySelect id="spot-category" value={category} onChange={setCategory} />
      <input id="spot-note" className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)" />
      <button
        type="button"
        className="btn-primary w-full"
        disabled={pending || !name.trim()}
        onClick={() =>
          onSave(async (s) => {
            const res = await s.createCafe({ name, address: where || null, zip: zip || null, hiringSign: hiring, notes: note, category, source: "spotted", stage: "to_visit" });
            if (photo && !res.duplicate) await store.addPhoto(res.id, photo);
            return res;
          })
        }
      >
        {pending ? "Saving…" : "Save spot"}
      </button>
    </div>
  );
}

function Manual({ pending, onSave }: { pending: boolean; onSave: (fn: (s: Store) => Promise<Result>) => void }) {
  const [f, setF] = useState({ name: "", address: "", instagram: "", notes: "" });
  const [zip, setZip] = useState("");
  const [category, setCategory] = useState<Category>("coffee");
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF((x) => ({ ...x, [k]: e.target.value }));
  return (
    <form
      className="card space-y-3 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        onSave((s) => s.createCafe({ ...f, zip: zip || null, category, source: "manual" }));
      }}
    >
      <label className="block">
        <span className="label">Name</span>
        <input id="m-name" className="input" required value={f.name} onChange={set("name")} />
      </label>
      <label className="block">
        <span className="label">Street address</span>
        <input id="m-address" className="input" value={f.address} onChange={set("address")} placeholder="310 E Pike St" />
      </label>
      <ZipSelect id="m-zip" value={zip} onChange={setZip} />
      <label className="block">
        <span className="label">Instagram</span>
        <input id="m-ig" className="input" value={f.instagram} onChange={set("instagram")} placeholder="@cafe" autoCapitalize="off" />
      </label>
      <label className="block">
        <span className="label">Notes</span>
        <input id="m-notes" className="input" value={f.notes} onChange={set("notes")} />
      </label>
      <CategorySelect id="m-category" value={category} onChange={setCategory} />
      <button className="btn-primary w-full" disabled={pending}>
        {pending ? "Saving…" : "Save cafe"}
      </button>
      <p className="text-xs text-muted">
        Have a whole list?{" "}
        <NavButton to={{ name: "import" }} className="font-semibold text-accent underline">
          Import it
        </NavButton>
      </p>
      <Toast>Tip: the 988 Seattle cafes from the city list are already in — search before adding.</Toast>
    </form>
  );
}
