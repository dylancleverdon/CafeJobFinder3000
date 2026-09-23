"use client";

import "leaflet/dist/leaflet.css";
import { useEffect } from "react";
import { CircleMarker, MapContainer, Polyline, Popup, TileLayer, Tooltip, useMap } from "react-leaflet";
import type { LatLng } from "@/lib/route/geo";

export type MapPoint = LatLng & {
  id: number | string;
  title: string;
  subtitle?: string;
  color: string;
  approximate?: boolean;
  href?: string;
  label?: string; // e.g. stop number
};

export type MapLine = { points: LatLng[]; mode: "walk" | "drive" };

const SEATTLE: [number, number] = [47.6205, -122.3321];

function FitBounds({ points, fitKey }: { points: LatLng[]; fitKey: string }) {
  const map = useMap();
  useEffect(() => {
    if (!points.length) return;
    if (points.length === 1) map.setView([points[0].lat, points[0].lng], 15);
    else map.fitBounds(points.map((p) => [p.lat, p.lng] as [number, number]), { padding: [30, 30], maxZoom: 16 });
    // Only refit when the set of points changes, not on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey, map]);
  return null;
}

// Approximate (ZIP-center) pins would all stack on one spot — spread them a little.
function jitter(p: MapPoint): [number, number] {
  if (!p.approximate) return [p.lat, p.lng];
  const n = typeof p.id === "number" ? p.id : [...String(p.id)].reduce((a, c) => a + c.charCodeAt(0), 0);
  const angle = (n * 137.508 * Math.PI) / 180;
  const r = 0.0012 + ((n * 7919) % 100) / 100000 * 2.5;
  return [p.lat + r * Math.sin(angle), p.lng + r * 1.5 * Math.cos(angle)];
}

export default function MapInner({
  points,
  lines = [],
  you,
  height = 420,
}: {
  points: MapPoint[];
  lines?: MapLine[];
  you?: LatLng | null;
  height?: number;
}) {
  const fitPoints = [...points, ...(you ? [you] : [])];
  const fitKey = fitPoints.map((p) => `${p.lat.toFixed(4)},${p.lng.toFixed(4)}`).join("|");
  return (
    <div className="overflow-hidden rounded-2xl border border-line" style={{ height }}>
      <MapContainer center={SEATTLE} zoom={12} style={{ height: "100%", width: "100%" }} scrollWheelZoom>
        {/* Background map picture only — no cafe data comes from here. */}
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
          subdomains="abcd"
          maxZoom={20}
        />
        <FitBounds points={fitPoints} fitKey={fitKey} />
        {lines.map((l, i) => (
          <Polyline
            key={i}
            positions={l.points.map((p) => [p.lat, p.lng] as [number, number])}
            pathOptions={{ color: l.mode === "drive" ? "#2563eb" : "#6f3f22", weight: l.mode === "drive" ? 4 : 3, dashArray: l.mode === "walk" ? "6 6" : undefined }}
          />
        ))}
        {points.map((p) => (
          <CircleMarker
            key={p.id}
            center={jitter(p)}
            radius={p.label ? 11 : 7}
            pathOptions={{ color: "#fff", weight: 2, fillColor: p.color, fillOpacity: p.approximate ? 0.45 : 0.95, dashArray: p.approximate ? "2 3" : undefined }}
          >
            {p.label && (
              <Tooltip permanent direction="center" className="!border-0 !bg-transparent !p-0 !shadow-none !text-xs !font-bold !text-white">
                {p.label}
              </Tooltip>
            )}
            <Popup>
              <div className="text-sm">
                <div className="font-semibold">{p.title}</div>
                {p.subtitle && <div className="text-xs opacity-70">{p.subtitle}</div>}
                {p.approximate && <div className="text-xs italic opacity-70">Approximate location</div>}
                {p.href && (
                  <a href={p.href} className="mt-1 inline-block font-semibold">
                    Open →
                  </a>
                )}
              </div>
            </Popup>
          </CircleMarker>
        ))}
        {you && (
          <CircleMarker center={[you.lat, you.lng]} radius={8} pathOptions={{ color: "#fff", weight: 3, fillColor: "#2563eb", fillOpacity: 1 }}>
            <Tooltip>You</Tooltip>
          </CircleMarker>
        )}
      </MapContainer>
    </div>
  );
}
