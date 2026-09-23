"use client";

import { useState, useTransition } from "react";
import { restoreBackup } from "@/app/actions";

export default function BackupPanel() {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <section className="card mb-4 p-4">
      <h2 className="font-semibold">Backup</h2>
      <p className="mt-1 text-sm text-muted">Your data lives in the app&apos;s database, so updates never erase it. A backup file is an extra safety net.</p>
      <div className="mt-3 flex gap-2">
        <a className="btn-ghost flex-1" href="/api/export">
          ⬇ Download backup
        </a>
        <label className="btn-ghost flex-1 cursor-pointer">
          ⬆ Restore
          <input
            type="file"
            accept="application/json,.json"
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (!f || !confirm("Replace everything in the app with this backup?")) return;
              start(async () => {
                try {
                  const r = await restoreBackup(await f.text());
                  setMsg(`Restored ${r.cafes} cafes and ${r.interactions} history entries ✓`);
                } catch (err) {
                  setMsg(err instanceof Error ? err.message : "Restore failed");
                }
              });
            }}
          />
        </label>
      </div>
      {(pending || msg) && <p className="mt-2 text-sm text-muted">{pending ? "Restoring…" : msg}</p>}
    </section>
  );
}
