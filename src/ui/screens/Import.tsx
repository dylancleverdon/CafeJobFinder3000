import Papa from "papaparse";
import { useState } from "react";
import { PageHeader } from "../components/ui";
import { useNav } from "../router";
import { useStoreApi } from "../useStore";
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

export default function Import() {
  const nav = useNav();
  return (
    <>
      <button type="button" onClick={nav.back} className="mb-3 inline-block text-sm font-semibold text-accent">
        ← Back
      </button>
      <PageHeader title="Import" subtitle="Bring in cafes from a file or a list." />
      <div className="space-y-4">
        <LicenseImport />
        <PasteList />
        <GenericCsv />
      </div>
    </>
  );
}

function LicenseImport() {
  const store = useStoreApi();
  const [status, setStatus] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<LicenseCandidate[] | null>(null);
  const [stats, setStats] = useState<LicenseFilterStats | null>(null);
  const [preview, setPreview] = useState<ReturnType<typeof store.licenseImportPreview> | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);

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
      setPreview(store.licenseImportPreview(res.candidates));
    } catch {
      setStatus("Couldn't read that file.");
    }
  };

  return (
    <section className="card p-4">
      <h2 className="font-semibold">Newer Seattle license list</h2>
      <p className="mt-1 text-sm text-muted">
        The app already has the September 2026 list. When the city posts a newer “Active Business License Tax Certificate” CSV on{" "}
        <a className="font-semibold text-accent underline" href="https://data.seattle.gov/browse?q=Active%20Business%20License%20Tax%20Certificate" target="_blank" rel="noreferrer">
          data.seattle.gov
        </a>
        , upload it here. New places get added; ones that disappeared get a “may have closed” badge. Your notes and stages are never touched.
      </p>
      <label className="btn-ghost mt-3 w-full cursor-pointer">
        Choose CSV file
        <input id="license-file" type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
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
          {preview && (
            <div className="rounded-xl bg-accent-soft p-3" data-testid="license-preview">
              <p>
                <b>{preview.added}</b> new · <b>{preview.missing}</b> no longer licensed (may have closed) · <b>{preview.unchanged}</b> unchanged
                {preview.returned ? ` · ${preview.returned} back on the list` : ""}
              </p>
              <button
                type="button"
                className="btn-primary mt-3 w-full"
                disabled={!!progress || !!result}
                onClick={async () => {
                  const r = await store.applyLicenseImport(candidates, (d, t) => setProgress(`Saving ${d} of ${t}…`));
                  setProgress(null);
                  setResult(`Added ${r.added}, flagged ${r.missing} as may-have-closed ✓`);
                }}
              >
                {result ?? progress ?? "Apply update"}
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function PasteList() {
  const store = useStoreApi();
  const [text, setText] = useState("");
  const [items, setItems] = useState<(PastedCandidate & { keep: boolean })[] | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  return (
    <section className="card p-4">
      <h2 className="font-semibold">Paste a list</h2>
      <p className="mt-1 text-sm text-muted">A “best coffee in Seattle” article, a roaster&apos;s “where to find us” page, or your own notes — one cafe per line.</p>
      <textarea id="paste-list" className="input mt-3 min-h-28 py-2" value={text} onChange={(e) => setText(e.target.value)} placeholder={"1. Victrola Coffee – Capitol Hill\n2. Elm Coffee Roasters\n…"} />
      <button type="button" className="btn-soft mt-2 w-full" disabled={!text.trim()} onClick={() => setItems(parsePastedList(text).map((p) => ({ ...p, keep: true })))}>
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
            type="button"
            className="btn-primary w-full"
            disabled={!!progress || !items.some((x) => x.keep)}
            onClick={async () => {
              const r = await store.importSimple(
                items.filter((x) => x.keep).map((x) => ({ name: x.name, note: x.note })),
                "paste",
                (d, t) => setProgress(`Adding ${d} of ${t}…`),
              );
              setProgress(null);
              setResult(`Added ${r.added}${r.skipped ? `, skipped ${r.skipped} you already had` : ""} ✓`);
              setItems(null);
              setText("");
            }}
          >
            {progress ?? `Add ${items.filter((x) => x.keep).length} cafes`}
          </button>
        </div>
      )}
      {result && <p className="mt-2 text-sm text-muted">{result}</p>}
    </section>
  );
}

function GenericCsv() {
  const store = useStoreApi();
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [map, setMap] = useState<ColumnMap>({});
  const [rows, setRows] = useState<(CsvCandidate & { keep: boolean })[] | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);

  return (
    <section className="card p-4">
      <h2 className="font-semibold">Other spreadsheet (CSV)</h2>
      <p className="mt-1 text-sm text-muted">E.g. King County food-inspection data. Keeps rows whose names sound like coffee, tea or bakery spots.</p>
      <label className="btn-ghost mt-3 w-full cursor-pointer">
        Choose CSV file
        <input
          id="generic-file"
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
          {isSeattleLicenseFile(parsed.fields) && <p className="text-sm text-danger">This is the Seattle license file — use the first box instead.</p>}
          <div className="grid grid-cols-2 gap-2">
            {(["name", "address", "zip", "lat", "lng", "type"] as const).map((k) => (
              <label key={k} className="text-sm">
                <span className="label">{k}</span>
                <select id={`map-${k}`} className="input text-sm" value={map[k] ?? ""} onChange={(e) => setMap((m) => ({ ...m, [k]: e.target.value || undefined }))}>
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
          <button type="button" className="btn-soft w-full" disabled={!map.name} onClick={() => setRows(filterGenericCsv(parsed.rows, map).map((r) => ({ ...r, keep: true })))}>
            Find cafes in {parsed.rows.length.toLocaleString()} rows
          </button>
        </div>
      )}
      {rows && (
        <div className="mt-3 space-y-2">
          <p className="text-sm">{rows.length} matches</p>
          <ul className="max-h-72 space-y-1 overflow-y-auto">
            {rows.slice(0, 300).map((r, i) => (
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
            type="button"
            className="btn-primary w-full"
            disabled={!!progress || !rows.some((r) => r.keep)}
            onClick={async () => {
              const r = await store.importSimple(rows.filter((x) => x.keep).slice(0, 300), "csv", (d, t) => setProgress(`Adding ${d} of ${t}…`));
              setProgress(null);
              setResult(`Added ${r.added}${r.skipped ? `, skipped ${r.skipped} duplicates` : ""} ✓`);
              setRows(null);
            }}
          >
            {progress ?? `Add ${Math.min(300, rows.filter((r) => r.keep).length)} cafes`}
          </button>
        </div>
      )}
      {result && <p className="mt-2 text-sm text-muted">{result}</p>}
    </section>
  );
}
