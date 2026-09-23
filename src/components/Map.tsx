"use client";

import dynamic from "next/dynamic";

// Leaflet needs `window`, so the map only renders in the browser.
const Map = dynamic(() => import("./MapInner"), {
  ssr: false,
  loading: () => <div className="flex h-[420px] items-center justify-center rounded-2xl border border-line bg-accent-soft text-sm text-muted">Loading map…</div>,
});

export default Map;
export type { MapPoint, MapLine } from "./MapInner";
