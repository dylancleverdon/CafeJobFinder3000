"use client";

import { useTransition } from "react";
import { addPhoto, deletePhoto } from "@/app/actions";
import { downscalePhoto } from "@/lib/client/photo";

export default function Photos({ cafeId, photos }: { cafeId: number; photos: { id: number; dataUrl: string; takenAt: string }[] }) {
  const [pending, start] = useTransition();
  return (
    <section className="card mb-4 p-4">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="font-semibold">Photos</h2>
        <label className="btn-soft cursor-pointer text-sm">
          {pending ? "Saving…" : "📷 Add"}
          <input
            type="file"
            accept="image/*"
            capture="environment"
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) start(async () => addPhoto(cafeId, await downscalePhoto(file)));
              e.target.value = "";
            }}
          />
        </label>
      </div>
      {photos.length === 0 ? (
        <p className="text-sm text-muted">Snap the storefront, a hiring sign, or the menu.</p>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          {photos.map((p) => (
            <div key={p.id} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.dataUrl} alt="" className="aspect-square w-full rounded-xl object-cover" />
              <button className="absolute top-1 right-1 rounded-full bg-black/60 px-1.5 text-xs text-white" onClick={() => confirm("Delete photo?") && start(() => deletePhoto(p.id))} aria-label="Delete photo">
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
