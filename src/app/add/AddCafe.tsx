"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { createCafe, readMapsLink, type NewCafeInput } from "@/app/actions";
import { PageHeader } from "@/components/ui";
import { CATEGORIES, type Category } from "@/db/schema";
import { downscalePhoto } from "@/lib/client/photo";
import { useMyLocation } from "@/lib/client/useMyLocation";
import type { ParsedPlace } from "@/lib/gmaps-link";
import { CATEGORY_LABEL } from "@/lib/labels";

type Tab = "link" | "spotted" | "manual";

function CategorySelect({ value, onChange }: { value: Category; onChange: (c: Category) => void }) {
  return (
    <label className="block">
      <span className="label">Type</span>
      <select className="input" value={value} onChange={(e) => onChange(e.target.value as Category)}>
        {CATEGORIES.map((c) => (
          <option key={c} value={c}>
            {CATEGORY_LABEL[c]}
          </option>
        ))}
      </select>
    </label>
  );
}

export default function AddCafe({ initialTab, sharedText, sharedTitle }: { initialTab: Tab; sharedText: string; sharedTitle: string | null }) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const router = useRouter();
  const [pending, start] = useTransition();
  const [duplicate, setDuplicate] = useState<{ id: number; pinUpdated?: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const save = (input: NewCafeInput) =>
    start(async () => {
      setError(null);
      try {
        const res = await createCafe(input);
        if (res.duplicate) setDuplicate(res);
        else router.push(`/cafes/${res.id}`);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't save");
      }
    });

  return (
    <>
      <PageHeader title="Add a cafe" subtitle="No apps or accounts — just links, your GPS, or typing." />
      <div className="mb-4 grid grid-cols-3 rounded-xl border border-line bg-card p-0.5 text-sm font-semibold" role="tablist">
        {(
          [
            ["link", "🔗 Maps link"],
            ["spotted", "📍 Spotted"],
            ["manual", "✍️ Type it"],
          ] as const
        ).map(([t, label]) => (
          <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={`rounded-lg py-2 ${tab === t ? "bg-accent text-accent-ink" : "text-muted"}`}>
            {label}
          </button>
        ))}
      </div>

      {duplicate && (
        <div className="card mb-4 p-4 text-sm" role="status">
          {duplicate.pinUpdated ? "Already in your list — updated its map pin from Google Maps ✓ " : "That looks like a place you already have. "}
          <Link className="font-semibold text-accent underline" href={`/cafes/${duplicate.id}`}>
            Open it
          </Link>
        </div>
      )}
      {error && <p className="mb-3 text-sm text-danger">{error}</p>}

      {tab === "link" && <FromLink sharedText={sharedText} sharedTitle={sharedTitle} pending={pending} onSave={save} />}
      {tab === "spotted" && <Spotted pending={pending} onSave={save} />}
      {tab === "manual" && <Manual pending={pending} onSave={save} />}
    </>
  );
}

function FromLink({ sharedText, sharedTitle, pending, onSave }: { sharedText: string; sharedTitle: string | null; pending: boolean; onSave: (i: NewCafeInput) => void }) {
  const [text, setText] = useState(sharedText);
  const [place, setPlace] = useState<(ParsedPlace & { error?: string }) | null>(null);
  const [name, setName] = useState("");
  const [category, setCategory] = useState<Category>("coffee");
  const [reading, start] = useTransition();
  const auto = useRef(false);

  const read = (value: string, title?: string | null) =>
    start(async () => {
      const r = await readMapsLink(value, title);
      setPlace(r);
      setName(r.name ?? "");
    });

  useEffect(() => {
    if (sharedText && !auto.current) {
      auto.current = true;
      read(sharedText, sharedTitle);
    }
  }, [sharedText, sharedTitle]);

  return (
    <div className="space-y-3">
      <div className="card space-y-3 p-4">
        <p className="text-sm text-muted">
          In Google Maps, open the cafe → <b>Share</b> → {typeof navigator !== "undefined" && /android/i.test(navigator.userAgent) ? "pick Cafe Jobs" : "Copy link"}, then paste it here.
        </p>
        <textarea className="input min-h-20 py-2" placeholder="https://maps.app.goo.gl/…" value={text} onChange={(e) => setText(e.target.value)} />
        <div className="flex gap-2">
          <button
            className="btn-soft"
            onClick={async () => {
              try {
                const t = await navigator.clipboard.readText();
                setText(t);
                read(t);
              } catch {
                /* clipboard blocked — user can paste manually */
              }
            }}
          >
            📋 Paste
          </button>
          <button className="btn-primary flex-1" disabled={reading || !text.trim()} onClick={() => read(text)}>
            {reading ? "Reading link…" : "Read link"}
          </button>
        </div>
      </div>

      {place && (
        <div className="card space-y-3 p-4">
          {place.error && <p className="text-sm text-danger">{place.error}</p>}
          <label className="block">
            <span className="label">Name</span>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Cafe name" />
          </label>
          {place.address && <p className="text-sm text-muted">{place.address}</p>}
          <p className="text-sm">
            {place.lat != null ? (place.precision === "place" ? "📍 Exact location found" : "📍 Approximate location (map view)") : "No location in that link — you can set it later with “I'm here”."}
          </p>
          <CategorySelect value={category} onChange={setCategory} />
          <button
            className="btn-primary w-full"
            disabled={pending || !name.trim()}
            onClick={() =>
              onSave({
                name,
                address: place.address,
                lat: place.lat,
                lng: place.lng,
                exactPin: place.precision === "place",
                googleMapsUrl: place.url,
                category,
                source: "gmaps",
              })
            }
          >
            {pending ? "Saving…" : "Save cafe"}
          </button>
        </div>
      )}
    </div>
  );
}

function Spotted({ pending, onSave }: { pending: boolean; onSave: (i: NewCafeInput) => void }) {
  const { location, locate, status, error } = useMyLocation();
  const [name, setName] = useState("");
  const [hiring, setHiring] = useState(false);
  const [note, setNote] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);
  const [category, setCategory] = useState<Category>("coffee");

  useEffect(() => {
    locate();
  }, [locate]);

  return (
    <div className="card space-y-3 p-4">
      <p className="text-sm">
        {status === "locating" && "Getting your location…"}
        {status === "ok" && location && `📍 Got it (${location.lat.toFixed(5)}, ${location.lng.toFixed(5)})`}
        {status === "error" && <span className="text-danger">{error}</span>}
        {status === "error" && (
          <button className="ml-2 font-semibold text-accent" onClick={() => locate()}>
            Try again
          </button>
        )}
      </p>
      <label className="block">
        <span className="label">Name (optional)</span>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="What's on the sign?" />
      </label>
      <label className="flex items-center gap-3 rounded-xl border border-line p-3">
        <input type="checkbox" className="h-5 w-5" checked={hiring} onChange={(e) => setHiring(e.target.checked)} />
        <span>
          <span className="font-semibold">“Now hiring” sign in the window</span>
          <span className="block text-xs text-muted">Moves it to the top of your list</span>
        </span>
      </label>
      <label className="btn-ghost w-full cursor-pointer">
        {photo ? "📷 Photo added — retake" : "📷 Snap the storefront"}
        <input
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
      {photo && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photo} alt="Storefront" className="max-h-48 w-full rounded-xl object-cover" />
      )}
      <CategorySelect value={category} onChange={setCategory} />
      <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)" />
      <button
        className="btn-primary w-full"
        disabled={pending || !location}
        onClick={() =>
          location &&
          onSave({
            name: name.trim() || `Spotted ${new Date().toLocaleString("en-US", { weekday: "short", hour: "numeric", minute: "2-digit" })}`,
            lat: location.lat,
            lng: location.lng,
            hiringSign: hiring,
            notes: note,
            photo,
            category,
            source: "spotted",
            stage: "to_visit",
          })
        }
      >
        {pending ? "Saving…" : "Save spot"}
      </button>
    </div>
  );
}

function Manual({ pending, onSave }: { pending: boolean; onSave: (i: NewCafeInput) => void }) {
  const [f, setF] = useState({ name: "", address: "", zip: "", instagram: "", notes: "" });
  const [category, setCategory] = useState<Category>("coffee");
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF((x) => ({ ...x, [k]: e.target.value }));
  return (
    <form
      className="card space-y-3 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        onSave({ ...f, category, source: "manual" });
      }}
    >
      <label className="block">
        <span className="label">Name</span>
        <input className="input" required value={f.name} onChange={set("name")} />
      </label>
      <div className="grid grid-cols-[1fr_6rem] gap-2">
        <label>
          <span className="label">Street address</span>
          <input className="input" value={f.address} onChange={set("address")} placeholder="310 E Pike St" />
        </label>
        <label>
          <span className="label">ZIP</span>
          <input className="input" value={f.zip} onChange={set("zip")} inputMode="numeric" />
        </label>
      </div>
      <label className="block">
        <span className="label">Instagram</span>
        <input className="input" value={f.instagram} onChange={set("instagram")} placeholder="@cafe" autoCapitalize="off" />
      </label>
      <label className="block">
        <span className="label">Notes</span>
        <input className="input" value={f.notes} onChange={set("notes")} />
      </label>
      <CategorySelect value={category} onChange={setCategory} />
      <button className="btn-primary w-full" disabled={pending}>
        {pending ? "Saving…" : "Save cafe"}
      </button>
      <p className="text-xs text-muted">
        Have a whole list? <Link className="font-semibold text-accent underline" href="/import">Import it</Link>
      </p>
    </form>
  );
}
