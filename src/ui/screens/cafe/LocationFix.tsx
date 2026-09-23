import { useState } from "react";
import type { Cafe } from "@/lib/types";
import { googleMapsSearchUrl } from "@/lib/text";
import { useStoreApi } from "../../useStore";
import { canUseGps, getPosition } from "../../native";

/** Exact pins come from Google Maps links (the app can't use GPS inside Claude). */
export default function LocationFix({ cafe }: { cafe: Cafe }) {
  const store = useStoreApi();
  const [link, setLink] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const search = googleMapsSearchUrl([cafe.name, cafe.address, `Seattle, WA ${cafe.zip ?? ""}`.trim()].filter(Boolean).join(", "));

  return (
    <section className="card mb-4 p-4">
      <div className="mb-1 flex items-baseline justify-between">
        <h2 className="font-semibold">Map pin</h2>
        <span className="text-xs text-muted">{cafe.pinQuality === "exact" ? "Exact" : cafe.pinQuality === "approximate" ? "Neighborhood only" : "None yet"}</span>
      </div>
      <p className="text-sm text-muted">
        {cafe.pinQuality === "exact"
          ? "Route times use this cafe's exact spot."
          : canUseGps()
            ? "Routes group this cafe by neighborhood. When you're standing at it, tap “I'm here” for an exact pin."
            : "Routes group this cafe by neighborhood. For exact walking times, open it in Google Maps, copy the link from the address bar (the long one), and paste it here."}
      </p>
      {canUseGps() && (
        <button
          type="button"
          className="btn-ghost mt-3 w-full"
          onClick={async () => {
            try {
              const p = await getPosition();
              await store.setCafeLocation(cafe.id, p.lat, p.lng);
              setMsg("Pin set to where you're standing ✓");
            } catch (e) {
              setMsg(e instanceof Error ? e.message : "Couldn't get your location");
            }
          }}
        >
          📍 I&apos;m here — set the pin to my location
        </button>
      )}
      <div className="mt-3 flex gap-2">
        <input id={`pin-link-${cafe.id}`} className="input" placeholder="Paste a Google Maps link" value={link} onChange={(e) => setLink(e.target.value)} />
        <button
          type="button"
          className="btn-soft"
          disabled={!link.trim()}
          onClick={async () => {
            const r = store.readMapsLink(link);
            if (r.lat == null || r.lng == null) {
              setMsg(r.shortLinkOnly ? "Short links (maps.app.goo.gl) don't include the location. Open it first, then copy the long link." : "That link didn't include a location.");
              return;
            }
            await store.setCafeLocation(cafe.id, r.lat, r.lng, r.url);
            setLink("");
            setMsg("Pin updated ✓");
          }}
        >
          Use
        </button>
      </div>
      <a className="mt-2 inline-block text-sm font-semibold text-accent underline" href={cafe.googleMapsUrl ?? search} target="_blank" rel="noreferrer">
        Open in Google Maps
      </a>
      {msg && <p className="mt-2 text-sm text-muted">{msg}</p>}
    </section>
  );
}
