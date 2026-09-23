"use client";

import { useState, useTransition } from "react";
import { readMapsLink, setCafeLocation } from "@/app/actions";
import Map from "@/components/Map";
import type { PinQuality } from "@/db/schema";
import { useMyLocation } from "@/lib/client/useMyLocation";

export default function LocationFix({ cafeId, pinQuality, lat, lng, name }: { cafeId: number; pinQuality: PinQuality; lat: number | null; lng: number | null; name: string }) {
  const { locate, status, error } = useMyLocation();
  const [pending, start] = useTransition();
  const [link, setLink] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  const useHere = () =>
    start(async () => {
      const here = await locate();
      if (!here) return;
      await setCafeLocation(cafeId, here.lat, here.lng);
      setMsg("Pin set to where you're standing ✓");
    });

  const useLink = () =>
    start(async () => {
      const r = await readMapsLink(link);
      if (r.lat == null || r.lng == null) {
        setMsg(r.error ?? "That link didn't include a location.");
        return;
      }
      await setCafeLocation(cafeId, r.lat, r.lng);
      setLink("");
      setMsg("Pin updated from Google Maps ✓");
    });

  return (
    <section className="card mb-4 p-4">
      <div className="mb-2 flex items-baseline justify-between">
        <h2 className="font-semibold">Location</h2>
        <span className="text-xs text-muted">{pinQuality === "exact" ? "Exact pin" : pinQuality === "approximate" ? "Approximate (ZIP area)" : "No pin yet"}</span>
      </div>
      {lat != null && lng != null && <Map points={[{ id: cafeId, lat, lng, title: name, color: "#6f3f22", approximate: pinQuality !== "exact" }]} height={180} />}
      <div className="mt-3 space-y-2">
        <button className="btn-ghost w-full" onClick={useHere} disabled={pending}>
          {status === "locating" ? "Locating…" : "📍 I'm here — set the pin to my location"}
        </button>
        <div className="flex gap-2">
          <input className="input" placeholder="…or paste a Google Maps link" value={link} onChange={(e) => setLink(e.target.value)} />
          <button className="btn-soft" onClick={useLink} disabled={pending || !link.trim()}>
            Use
          </button>
        </div>
        {(msg || error) && <p className="text-sm text-muted">{msg ?? error}</p>}
      </div>
    </section>
  );
}
