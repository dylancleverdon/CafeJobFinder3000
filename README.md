# ☕ Cafe Job Finder 3000

A personal CRM for landing a barista job in Seattle **without job boards**. It runs as a private app inside your Claude account. There's nothing to install or host, and nothing to set up.

**Open it:** https://claude.ai/artifact/MDGaFSA4CQRXsb3jmomuLt (only you can open it while you're signed in to Claude). On your phone, open that link in the Claude app or your browser. You can add it to your home screen from the browser's share menu.

## What it does

- **988 Seattle cafes built in.** These are all the coffee shops, bakeries, bagel and breakfast spots, tea/boba bars and other drink bars from the city's public business-license list (Sept 2026), with **Chain** and **New opening** badges. No cafe apps or APIs are used.
- **Add more** by pasting a Google Maps share, jotting down one you spotted on the street (name, where, photo, "Now hiring" sign), typing one in, or importing a pasted list or CSV.
- **Track outreach.** The stages are Discovered → To visit → Applied → Following up → Trial → Offer, plus *Revisit later*. One tap logs what happened ("Dropped resume", "Not hiring", "Come back Thursday"…) and schedules the next follow-up. **Today** shows who's due.
- **Plan a walk-in day.** Pick neighborhoods and walk, drive, or **drive + walk** (park once per neighborhood). The best stops are chosen for you and timed for the quiet 2–4 PM window. "Navigate" opens Google Maps.

## Your data

Your changes (stages, notes, visit history, photos, cafes you add) are saved to the app's own database in your Claude account. The same data shows on every device you open it on. **Updates never touch it.** For extra peace of mind: **More → Download backup**.

Because it runs inside Claude, the app can't use your phone's GPS or show a street map. Cafes are grouped by neighborhood, and Google Maps handles turn-by-turn directions.

## Updating

Ask Claude for a change. Claude rebuilds and republishes the same link, and the new version appears the next time you open it (or within moments if it's already open). There's nothing to download.

To refresh the cafe list when Seattle posts a newer license export: download the *Active Business License Tax Certificate* CSV from [data.seattle.gov](https://data.seattle.gov/browse?q=Active%20Business%20License%20Tax%20Certificate) and upload it in **More → Import**. You'll see what's new and what might have closed before anything changes.

---

## For developers

```bash
npm install
npm test                  # unit tests (Vitest)
npm run typecheck && npm run lint
npm run build             # → dist/cafe-job-finder.html (the whole app in one file) + dist/preview.html
CHROMIUM_PATH=/opt/pw-browsers/chromium npm run test:e2e   # phone-sized Playwright test of dist/preview.html
```

- **Stack:** React 19 + Tailwind 4, bundled by esbuild into a single HTML file (`scripts/build-artifact.mjs`) and published as a Claude artifact. Data goes through the artifact `db` capability (`src/store/claudeBackend.ts`). Outside Claude, it falls back to `localStorage` (`src/store/localBackend.ts`).
- **Where things are:**
  - `src/lib/import/seattleLicense.ts` decides what counts as "might sell coffee"
  - `src/lib/followup.ts` has the follow-up rules
  - `src/lib/route/areaPlan.ts` is the neighborhood route planner
  - `src/store/store.ts` holds every action (built-in cafes + your stored changes layered on top)
  - `src/ui/` has the screens
- **Rebuild the built-in list:** put the license CSV in `data/raw/`, then `npm run seed:build`.
