"use client";

import { useState, useTransition } from "react";
import { lookUpAddress, saveSettings } from "@/app/actions";
import type { Settings } from "@/db/schema";
import { useMyLocation } from "@/lib/client/useMyLocation";

export default function SettingsForm({ settings }: { settings: Settings }) {
  const [pending, start] = useTransition();
  const { locate, status } = useMyLocation();
  const [addr, setAddr] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [f, setF] = useState({
    windowStart: settings.windowStart,
    windowEnd: settings.windowEnd,
    weeklyGoal: settings.weeklyGoal,
    followUpDays: settings.followUpDays,
    followUpAgainDays: settings.followUpAgainDays,
    revisitDays: settings.revisitDays,
    dwellMinutes: settings.dwellMinutes,
  });
  const num = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF((x) => ({ ...x, [k]: e.target.type === "time" ? e.target.value : Number(e.target.value) }));

  const setHome = (lat: number, lng: number, label: string) =>
    start(async () => {
      await saveSettings({ homeLat: lat, homeLng: lng, homeLabel: label });
      setMsg(`Home spot saved (${label}) ✓`);
    });

  return (
    <>
      <section className="card mb-4 p-4">
        <h2 className="font-semibold">Home spot</h2>
        <p className="mt-1 text-sm text-muted">
          {settings.homeLat != null ? `Set: ${settings.homeLabel ?? "Home"}` : "Where your routes start from and distances are measured."}
        </p>
        <div className="mt-3 space-y-2">
          <button
            className="btn-ghost w-full"
            disabled={pending}
            onClick={async () => {
              const here = await locate();
              if (here) setHome(here.lat, here.lng, "My location");
            }}
          >
            {status === "locating" ? "Locating…" : "📍 Use where I am now"}
          </button>
          <div className="flex gap-2">
            <input className="input" placeholder="…or an address, e.g. 1200 E Pine St" value={addr} onChange={(e) => setAddr(e.target.value)} />
            <button
              className="btn-soft"
              disabled={pending || !addr.trim()}
              onClick={() =>
                start(async () => {
                  const hit = await lookUpAddress(/seattle|, wa\b/i.test(addr) ? addr : `${addr}, Seattle, WA`);
                  if (hit) setHome(hit.lat, hit.lng, addr.trim());
                  else setMsg("Couldn't find that address.");
                })
              }
            >
              Set
            </button>
          </div>
          {msg && <p className="text-sm text-muted">{msg}</p>}
        </div>
      </section>

      <form
        className="card mb-4 space-y-3 p-4"
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            await saveSettings(f);
            setMsg("Saved ✓");
          });
        }}
      >
        <h2 className="font-semibold">Job-hunt rhythm</h2>
        <div className="grid grid-cols-2 gap-2">
          <label>
            <span className="label">Walk-ins from</span>
            <input type="time" className="input" value={f.windowStart} onChange={num("windowStart")} />
          </label>
          <label>
            <span className="label">until</span>
            <input type="time" className="input" value={f.windowEnd} onChange={num("windowEnd")} />
          </label>
          <label>
            <span className="label">Weekly goal (cafes)</span>
            <input type="number" min={1} className="input" value={f.weeklyGoal} onChange={num("weeklyGoal")} />
          </label>
          <label>
            <span className="label">Minutes per stop</span>
            <input type="number" min={1} className="input" value={f.dwellMinutes} onChange={num("dwellMinutes")} />
          </label>
          <label>
            <span className="label">Follow up after (days)</span>
            <input type="number" min={1} className="input" value={f.followUpDays} onChange={num("followUpDays")} />
          </label>
          <label>
            <span className="label">…and again after</span>
            <input type="number" min={1} className="input" value={f.followUpAgainDays} onChange={num("followUpAgainDays")} />
          </label>
          <label className="col-span-2">
            <span className="label">“Not hiring” → check back after (days)</span>
            <input type="number" min={1} className="input" value={f.revisitDays} onChange={num("revisitDays")} />
          </label>
        </div>
        <button className="btn-primary w-full" disabled={pending}>
          Save
        </button>
      </form>
    </>
  );
}
