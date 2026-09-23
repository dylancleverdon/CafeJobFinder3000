# CafeJobFinder3000 — notes for Claude

Personal barista job-hunt CRM for one user in Seattle. The user is not a developer. They do **not** want to set up hosting, accounts or anything else. Keep changes simple and explain them in plain words.

## Where the app lives
One single-file web app (`npm run build`) shipped two ways:

1. **Android APK (main way the user uses it).** Capacitor shell in `android/`.
   - GitHub Actions (`.github/workflows/android.yml`) builds it into a Release. Stable link: https://github.com/dylancleverdon/CafeJobFinder3000/releases/latest/download/CafeJobFinder.apk
   - A new APK is built only when `android/**`, `capacitor.config.ts`, `package*.json` or the workflow change, or on manual dispatch (`actions_run_trigger`, workflow `android.yml`, ref `main`).
   - **App updates are over the air:** the installed app polls `app/version.json` on `main` and downloads `app/cafe-job-finder.html`. So **shipping = `npm run build` → commit `app/` → push to `main`.**
   - Keep the package id `io.github.dylancleverdon.cafejobs` and the signing key `android/app/cafejobs-release.p12`. Changing either forces an uninstall, which wipes the user's on-phone data.
   - Data lives in WebView localStorage (`cjf:*` keys) and IndexedDB (`cjf-data` photos, `cjf-app` downloaded app copy).
2. **Private Claude artifact:** https://claude.ai/artifact/MDGaFSA4CQRXsb3jmomuLt (capabilities: `db`, `downloads`).
   - Publish `dist/cafe-job-finder.html` with the Artifact tool, passing `url` = that link (read it first from a new conversation). Omit `capabilities`/`icon` on redeploys.
   - Data lives in its db: `cafes/<id>` (changes to a built-in cafe + its `log`, or a whole record with `custom: true`), `meta/settings`, `meta/route`, `photos/<id>`.

**Never rename storage keys, collections or fields, and never change how ids are made.** Built-in cafe ids are `stableId("L", licenseKey)` (`src/store/seed.ts`), and changing them orphans the user's data.

## Ground rules from the user
- **No cafe-data APIs** (no Google Places / Foursquare / OpenStreetMap data, no API keys). Cafes come from the built-in Seattle license list, pasted Google Maps shares (parsed, not an API), "spotted" entries, and imports.
- "Anywhere that might sell coffee" counts: coffee, bakery/bagel/breakfast, tea/boba, and other drink/snack bars.
- Updates must never need a re-install and must never lose data.
- Inside the Claude artifact, GPS, network fetches and street-map tiles are blocked. Gate native-only features on `isNativeApp()` / `canUseGps()` (`src/ui/native.ts`) so both versions keep working.

## Before shipping
1. Add a line to `src/lib/changelog.ts`.
2. `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`, `CHROMIUM_PATH=/opt/pw-browsers/chromium npm run test:e2e` (includes the start-up/self-update test).
3. Commit (including `app/`), push to `main` (this is the Android update), and republish the artifact.

## Conventions
- Pure logic in `src/lib/**` with Vitest tests in `tests/`. The store (`src/store/store.ts`) is tested with the localStorage backend.
- UI: React function components in `src/ui/`, with Tailwind tokens from `src/ui/styles.css` (`bg-card`, `text-muted`, `btn-primary`…), in both light and dark mode.
- No `confirm()`/`alert()` (they don't work in artifacts). Use `ConfirmButton`. Phone numbers get `CopyText`.
