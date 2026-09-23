import { useEffect, useState } from "react";
import type { Photo } from "@/lib/types";
import { downscalePhoto } from "@/lib/client/photo";
import { ConfirmButton } from "../../components/ui";
import { useStoreApi } from "../../useStore";

export default function Photos({ cafeId }: { cafeId: string }) {
  const store = useStoreApi();
  const [photos, setPhotos] = useState<Photo[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    store
      .photosFor(cafeId)
      .then((p) => live && setPhotos(p.sort((a, b) => b.takenAt.localeCompare(a.takenAt))))
      .catch(() => live && setPhotos([]));
    return () => {
      live = false;
    };
  }, [store, cafeId]);

  return (
    <section className="card mb-4 p-4">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="font-semibold">Photos</h2>
        <label className="btn-soft cursor-pointer text-sm">
          {busy ? "Saving…" : "📷 Add"}
          <input
            id={`photo-${cafeId}`}
            type="file"
            accept="image/*"
            capture="environment"
            className="sr-only"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (!file) return;
              setBusy(true);
              setError(null);
              try {
                const p = await store.addPhoto(cafeId, await downscalePhoto(file));
                setPhotos((xs) => [p, ...(xs ?? [])]);
              } catch (err) {
                setError(err instanceof Error ? err.message : "Couldn't save the photo");
              } finally {
                setBusy(false);
              }
            }}
          />
        </label>
      </div>
      {error && <p className="mb-2 text-sm text-danger">{error}</p>}
      {photos === null ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : photos.length === 0 ? (
        <p className="text-sm text-muted">Snap the storefront, a hiring sign, or the menu.</p>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          {photos.map((p) => (
            <div key={p.id} className="relative">
              <img src={p.dataUrl} alt="" className="aspect-square w-full rounded-xl object-cover" />
              <ConfirmButton
                className="absolute top-1 right-1 rounded-full bg-black/60 px-1.5 text-xs text-white"
                label="✕"
                confirmLabel="Delete"
                onConfirm={async () => {
                  await store.deletePhoto(p.id);
                  setPhotos((xs) => (xs ?? []).filter((x) => x.id !== p.id));
                }}
              />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
