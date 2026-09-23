# ☕ Cafe Job Finder 3000

A personal CRM for landing a barista job in Seattle **without job boards**.

## Get the app

**Android (APK):** on your phone, open
**https://github.com/dylancleverdon/CafeJobFinder3000/releases/latest/download/CafeJobFinder.apk**
and tap **Install**. The first time, Android asks you to allow installing from your browser. Say yes. That's it: no accounts, no setup. The app updates itself (tap the "New version ready" banner) and never needs downloading again.

**Also available inside Claude:** https://claude.ai/artifact/MDGaFSA4CQRXsb3jmomuLt (private to you). It keeps its own separate data. Use **More → Download backup / Restore** to move data between the two.

## What it does

- **988 Seattle cafes built in.** These are all the coffee shops, bakeries, bagel and breakfast spots, tea/boba bars and other drink bars from the city's public business-license list (Sept 2026), with **Chain** and **New opening** badges. No cafe apps or APIs are used.
- **Add more** by pasting a Google Maps share, jotting down one you spotted on the street (name, where, photo, "Now hiring" sign), typing one in, or importing a pasted list or CSV.
- **Track outreach.** The stages are Discovered → To visit → Applied → Following up → Trial → Offer, plus *Revisit later*. One tap logs what happened ("Dropped resume", "Not hiring", "Come back Thursday"…) and schedules the next follow-up. **Today** shows who's due.
- **Plan a walk-in day.** Pick neighborhoods and walk, drive, or **drive + walk** (park once per neighborhood). The best stops are chosen for you and timed for the quiet 2–4 PM window. "Navigate" opens Google Maps.

## Your data

- **Android app:** saved on your phone. Updates never touch it. It's only erased if you uninstall the app, so use **More → Download backup** now and then.
- **Claude version:** saved in your Claude account.

Only the Android app can use GPS ("I'm standing here", routes from where you are). Claude blocks it inside Claude. Cafes are grouped by neighborhood, and Google Maps handles turn-by-turn directions.

## Updating

Ask Claude for a change. For screens and features, Claude pushes the new version to this repo and your installed app downloads it by itself, showing a **"New version ready — tap to update"** banner. The Claude version updates at the same link. A new APK is only needed if the Android shell itself changes, and even then it installs over the old one and keeps your data.

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

- **Stack:** React 19 + Tailwind 4, bundled by esbuild into a single HTML file (`scripts/build-artifact.mjs`).
  - **Android:** Capacitor shell in `android/`, built by GitHub Actions (`.github/workflows/android.yml`) into a GitHub Release. Over-the-air updates: the app checks `app/version.json` on `main` and downloads `app/cafe-job-finder.html` (`src/ui/updater.ts`). The start-up script in the APK runs the newest copy and falls back to the built-in one if a copy ever fails to start.
  - **Claude artifact:** data through the artifact `db` capability (`src/store/claudeBackend.ts`).
  - **Android / plain browser:** `localStorage` + IndexedDB for photos (`src/store/localBackend.ts`).
- **Signing key:** `android/app/cafejobs-release.p12` is committed on purpose, so any build can produce an update that installs over the previous one without the owner managing secrets. The repo is public, so it only protects against accidents. To harden it, move the key into a repository secret.
- **Where things are:**
  - `src/lib/import/seattleLicense.ts` decides what counts as "might sell coffee"
  - `src/lib/followup.ts` has the follow-up rules
  - `src/lib/route/areaPlan.ts` is the neighborhood route planner
  - `src/store/store.ts` holds every action (built-in cafes + your stored changes layered on top)
  - `src/ui/` has the screens
- **Rebuild the built-in list:** put the license CSV in `data/raw/`, then `npm run seed:build`.
