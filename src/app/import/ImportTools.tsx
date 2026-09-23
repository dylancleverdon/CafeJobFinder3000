"use client";

import Link from "next/link";
import Papa from "papaparse";
import { useState, useTransition } from "react";
import { applyLicenseImport, importSimple, licenseImportPreview } from "@/app/actions";
import { detectColumns, filterGenericCsv, type ColumnMap, type CsvCandidate } from "@/lib/import/csv";
import { parsePastedList, type PastedCandidate } from "@/lib/import/pasteList";
import { filterSeattleLicenses, isSeattleLicenseFile, type LicenseCandidate, type LicenseFilterStats, type LicenseRow } from "@/lib/import/seattleLicense";
import { CATEGORY_LABEL } from "@/lib/labels";

type Parsed = { rows: LicenseRow[]; fields: string[] };

function parseFile(file: File): Promise<Parsed> {
  return new Promise((resolve, reject) =>
    Papa.parse<LicenseRow>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (r) => resolve({ rows: r.data, fields: r.meta.fields ?? [] }),
      error: reject,
    }),
  );
}

export default function ImportTools() {
  return (
    <div className="space-y-4">
      <LicenseImport />
      <PasteList />
      <GenericCsv />
    </div>
  );
}

function LicenseImport() {
  const [status, setStatus] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<LicenseCandidate[] | null>(null);
  const [stats, setStats] = useState<LicenseFilterStats | null>(null);
  const [preview, setPreview] = useState<Awaited<ReturnType<typeof licenseImportPreview>> | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const onFile = async (file: File) => {
    setResult(null);
    setPreview(null);
    setStatus(`Reading ${file.name}…`);
    try {
      const { rows, fields } = await parseFile(file);
      if (!isSeattleLicenseFile(fields)) {
        setStatus("That doesn't look like the Seattle business-license export. Try “Other spreadsheet” below.");
        return;
      }
      const res = filterSeattleLicenses(rows);
      setCandidates(res.candidates);
      setStats(res.stats);
      setStatus(null);
      start(async () => setPreview(await licenseImportPreview(res.candidates)));
    } catch {
      setStatus("Couldn't read that file.");
    }
  };

  return (
    <section className="card p-4">
      <h2 className="font-semibold">Seattle business licenses</h2>
      <p className="mt-1 text-sm text-muted">
        Upload a newer “Active Business License Tax Certificate” CSV from{" "}
        <a className="font-semibold text-accent underline" href="https://data.seattle.gov/browse?q=Active%20Business%20License%20Tax%20Certificate" target="_blank" rel="noreferrer">
          data.seattle.gov
        </a>{" "}
        (Export → CSV). New places get added; ones that disappeared get a “may have closed” badge. Your notes and stages are never touched.
      </p>
      <label className="btn-ghost mt-3 w-full cursor-pointer">
        Choose CSV file
        <input type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
      </label>
      {status && <p className="mt-2 text-sm text-muted">{status}</p>}
      {stats && candidates && (
        <div className="mt-3 space-y-2 text-sm">
          <p>
            Found <b>{stats.kept}</b> places that might sell coffee out of {stats.totalRows.toLocaleString()} licenses:
          </p>
          <ul className="grid grid-cols-2 gap-1 text-muted">
            {(Object.keys(stats.byCategory) as (keyof typeof stats.byCategory)[]).map((k) => (
              <li key={k}>
                {CATEGORY_LABEL[k]}: <b className="text-ink">{stats.byCategory[k]}</b>
              </li>
            ))}
          </ul>
          {pending && !preview && <p className="text-muted">Comparing with your list…</p>}
          {preview && (
            <div className="rounded-xl bg-accent-soft p-3" data-testid="license-preview">
              <p>
                <b>{preview.added}</b> new · <b>{preview.missing}</b> no longer licensed (may have closed) · <b>{preview.unchanged}</b> unchanged
                {preview.returned ? ` · ${preview.returned} back on the list` : ""}
              </p>
              <button
                className="btn-primary mt-3 w-full"
                disabled={pending || !!result}
                onClick={() =>
                  start(async () => {
                    const r = await applyLicenseImport(candidates);
                    setResult(`Added ${r.added}, flagged ${r.missing} as may-have-closed.`);
                  })
                }
              >
                {result ?? (pending ? "Importing…" : "Apply update")}
              </button>
              {result && (
                <p className="mt-2 text-xs text-muted">
                  New places start with approximate pins — <Link className="font-semibold text-accent underline" href="/settings#pins">get exact pins</Link>.
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function PasteList() {
  const [text, setText] = useState("");
  const [items, setItems] = useState<(PastedCandidate & { keep: boolean })[] | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <section className="card p-4">
      <h2 className="font-semibold">Paste a list</h2>
      <p className="mt-1 text-sm text-muted">A “best coffee in Seattle” article, a roaster&apos;s “where to find us” page, or your own notes — one cafe per line.</p>
      <textarea className="input mt-3 min-h-28 py-2" value={text} onChange={(e) => setText(e.target.value)} placeholder={"1. Victrola Coffee – Capitol Hill\n2. Elm Coffee Roasters\n…"} />
      <button className="btn-soft mt-2 w-full" disabled={!text.trim()} onClick={() => setItems(parsePastedList(text).map((p) => ({ ...p, keep: true })))}>
        Find cafe names
      </button>
      {items && (
        <div className="mt-3 space-y-2">
          <ul className="max-h-72 space-y-1 overflow-y-auto">
            {items.map((it, i) => (
              <li key={i}>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={it.keep} onChange={(e) => setItems((xs) => xs!.map((x, j) => (j === i ? { ...x, keep: e.target.checked } : x)))} />
                  <span className="font-medium">{it.name}</span>
                  {it.note && <span className="truncate text-muted">· {it.note}</span>}
                </label>
              </li>
            ))}
          </ul>
          <button
            className="btn-primary w-full"
            disabled={pending || !items.some((x) => x.keep)}
            onClick={() =>
              start(async () => {
                const r = await importSimple(items.filter((x) => x.keep).map((x) => ({ name: x.name, note: x.note })), "paste");
                setResult(`Added ${r.added}${r.skipped ? `, skipped ${r.skipped} you already had` : ""}. They don't have pins yet — open one and use “Check” to find it, then share it back.`);
                setItems(null);
                setText("");
              })
            }
          >
            Add {items.filter((x) => x.keep).length} cafes
          </button>
        </div>
      )}
      {result && <p className="mt-2 text-sm text-muted">{result}</p>}
    </section>
  );
}

function GenericCsv() {
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [map, setMap] = useState<ColumnMap>({});
  const [rows, setRows] = useState<(CsvCandidate & { keep: boolean })[] | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <section className="card p-4">
      <h2 className="font-semibold">Other spreadsheet (CSV)</h2>
      <p className="mt-1 text-sm text-muted">E.g. King County food-inspection data. Keeps rows whose names sound like coffee, tea or bakery spots.</p>
      <label className="btn-ghost mt-3 w-full cursor-pointer">
        Choose CSV file
        <input
          type="file"
          accept=".csv,text/csv"
          className="sr-only"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            const p = await parseFile(f);
            setParsed(p);
            setMap(detectColumns(p.fields));
            setRows(null);
            setResult(null);
          }}
        />
      </label>
      {parsed && (
        <div className="mt-3 space-y-2">
          {isSeattleLicenseFile(parsed.fields) && <p className="text-sm text-danger">This is the Seattle license file — use the first box instead for the best results.</p>}
          <div className="grid grid-cols-2 gap-2">
            {(["name", "address", "zip", "lat", "lng", "type"] as const).map((k) => (
              <label key={k} className="text-sm">
                <span className="label">{k}</span>
                <select className="input text-sm" value={map[k] ?? ""} onChange={(e) => setMap((m) => ({ ...m, [k]: e.target.value || undefined }))}>
                  <option value="">—</option>
                  {parsed.fields.map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          <button className="btn-soft w-full" disabled={!map.name} onClick={() => setRows(filterGenericCsv(parsed.rows, map).map((r) => ({ ...r, keep: true })))}>
            Find cafes in {parsed.rows.length.toLocaleString()} rows
          </button>
        </div>
      )}
      {rows && (
        <div className="mt-3 space-y-2">
          <p className="text-sm">{rows.length} matches</p>
          <ul className="max-h-72 space-y-1 overflow-y-auto">
            {rows.slice(0, 500).map((r, i) => (
              <li key={i}>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={r.keep} onChange={(e) => setRows((xs) => xs!.map((x, j) => (j === i ? { ...x, keep: e.target.checked } : x)))} />
                  <span className="font-medium">{r.name}</span>
                  <span className="truncate text-muted">{r.address}</span>
                </label>
              </li>
            ))}
          </ul>
          <button
            className="btn-primary w-full"
            disabled={pending || !rows.some((r) => r.keep)}
            onClick={() =>
              start(async () => {
                const r = await importSimple(rows.filter((x) => x.keep).slice(0, 2000), "csv");
                setResult(`Added ${r.added}${r.skipped ? `, skipped ${r.skipped} duplicates` : ""}.`);
                setRows(null);
              })
            }
          >
            Add {rows.filter((r) => r.keep).length} cafes
          </button>
        </div>
      )}
      {result && <p className="mt-2 text-sm text-muted">{result}</p>}
    </section>
  );
}
