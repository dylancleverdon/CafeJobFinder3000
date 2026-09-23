import { useState } from "react";
import { PageHeader, Toast } from "../components/ui";
import { NavButton } from "../router";
import { saveFile } from "../platform";
import { useAppState, useStoreApi } from "../useStore";
import type { Settings } from "@/lib/types";
import { CHANGELOG } from "@/lib/changelog";
import { areaLabel } from "@/lib/neighborhoods";
import { SEED } from "@/store/seed";

declare const __BUILD_ID__: string;
declare const __BUILD_TIME__: string;

export default function More() {
  const { settings, cafes, backend } = useAppState();
  const store = useStoreApi();
  const [f, setF] = useState<Settings>(settings);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [backupMsg, setBackupMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const zips = [...new Set(cafes.map((c) => c.zip).filter(Boolean) as string[])].sort();
  const num = (k: keyof Settings) => (e: React.ChangeEvent<HTMLInputElement>) => setF((x) => ({ ...x, [k]: e.target.type === "time" ? e.target.value : Math.max(1, Math.min(365, Number(e.target.value) || 1)) }));

  return (
    <>
      <PageHeader title="More" />

      <form
        className="card mb-4 space-y-3 p-4"
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            await store.saveSettings(f);
            setMsg({ text: "Saved ✓", ok: true });
          } catch {
            setMsg({ text: "Couldn't save — check your connection.", ok: false });
          }
        }}
      >
        <h2 className="font-semibold">Your job hunt</h2>
        <label className="block">
          <span className="label">Home neighborhood</span>
          <select id="s-home" className="input" value={f.homeZip ?? ""} onChange={(e) => setF((x) => ({ ...x, homeZip: e.target.value || null }))}>
            <option value="">Not set</option>
            {zips.map((z) => (
              <option key={z} value={z}>
                {areaLabel(z)}
              </option>
            ))}
          </select>
          <span className="mt-1 block text-xs text-muted">Where walk-in days start, and what “closest” means.</span>
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label>
            <span className="label">Walk-ins from</span>
            <input id="s-start" type="time" className="input" value={f.windowStart} onChange={num("windowStart")} />
          </label>
          <label>
            <span className="label">until</span>
            <input id="s-end" type="time" className="input" value={f.windowEnd} onChange={num("windowEnd")} />
          </label>
          <label>
            <span className="label">Weekly goal</span>
            <input id="s-goal" type="number" min={1} className="input" value={f.weeklyGoal} onChange={num("weeklyGoal")} />
          </label>
          <label>
            <span className="label">Minutes per stop</span>
            <input id="s-dwell" type="number" min={1} className="input" value={f.dwellMinutes} onChange={num("dwellMinutes")} />
          </label>
          <label>
            <span className="label">Follow up after (days)</span>
            <input id="s-fu" type="number" min={1} className="input" value={f.followUpDays} onChange={num("followUpDays")} />
          </label>
          <label>
            <span className="label">…and again after</span>
            <input id="s-fu2" type="number" min={1} className="input" value={f.followUpAgainDays} onChange={num("followUpAgainDays")} />
          </label>
          <label className="col-span-2">
            <span className="label">“Not hiring” → check back after (days)</span>
            <input id="s-revisit" type="number" min={1} className="input" value={f.revisitDays} onChange={num("revisitDays")} />
          </label>
        </div>
        <button className="btn-primary w-full">Save</button>
        {msg && <Toast tone={msg.ok ? "good" : "bad"}>{msg.text}</Toast>}
      </form>

      <section className="card mb-4 p-4">
        <h2 className="font-semibold">Add more cafes</h2>
        <p className="mt-1 text-sm text-muted">Upload a newer Seattle license list, paste an article, or import another spreadsheet.</p>
        <NavButton to={{ name: "import" }} className="btn-ghost mt-3 w-full">
          Import
        </NavButton>
      </section>

      <section className="card mb-4 p-4">
        <h2 className="font-semibold">Your data</h2>
        <p className="mt-1 text-sm text-muted">
          {backend === "claude"
            ? "Saved to this app in your Claude account — it's there on any device you open it on, and app updates never erase it."
            : "Saved in this browser only (this copy isn't running inside Claude)."}
        </p>
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            className="btn-ghost flex-1"
            onClick={async () => {
              try {
                const ok = await saveFile(`cafe-job-finder-backup-${new Date().toISOString().slice(0, 10)}.json`, await store.exportBackup());
                setBackupMsg(ok ? { text: "Backup ready ✓", ok: true } : { text: "Saving files isn't available here.", ok: false });
              } catch {
                setBackupMsg({ text: "Backup cancelled.", ok: false });
              }
            }}
          >
            ⬇ Download backup
          </button>
          <label className="btn-ghost flex-1 cursor-pointer">
            ⬆ Restore
            <input
              id="restore-file"
              type="file"
              accept="application/json,.json"
              className="sr-only"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (!file) return;
                try {
                  const r = await store.restoreBackup(await file.text(), (d, t) => setBackupMsg({ text: `Restoring ${d} of ${t}…`, ok: true }));
                  setBackupMsg({ text: `Restored ${r.cafes} saved cafes ✓`, ok: true });
                } catch (err) {
                  setBackupMsg({ text: err instanceof Error ? err.message : "Restore failed", ok: false });
                }
              }}
            />
          </label>
        </div>
        {backupMsg && <Toast tone={backupMsg.ok ? "good" : "bad"}>{backupMsg.text}</Toast>}
      </section>

      <section className="card mb-4 p-4">
        <h2 className="font-semibold">What&apos;s new</h2>
        {CHANGELOG.map((c) => (
          <div key={c.date + c.title} className="mt-2">
            <p className="text-sm font-medium">
              {c.title} <span className="text-xs text-muted">· {c.date}</span>
            </p>
            <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-muted">
              {c.items.map((i) => (
                <li key={i}>{i}</li>
              ))}
            </ul>
          </div>
        ))}
        <p className="mt-3 text-xs text-muted">
          Version {__BUILD_ID__} · {new Date(__BUILD_TIME__).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} · Seattle list from {SEED.source.replace(/\.csv$/, "")}
        </p>
      </section>
    </>
  );
}
