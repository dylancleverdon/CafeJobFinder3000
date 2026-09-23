# CafeJobFinder3000 — notes for Claude

Personal barista job-hunt CRM for one user in Seattle. The user is not a developer. They do **not** want to set up hosting, accounts or anything else. Keep changes simple and explain them in plain words.

## Where the app lives
- It's a **private Claude artifact**: https://claude.ai/artifact/MDGaFSA4CQRXsb3jmomuLt (capabilities: `db`, `downloads`).
- The whole app builds into one file: `npm run build` → `dist/cafe-job-finder.html`.
- **To ship an update:** build, then publish that file with the Artifact tool, passing `url` = the link above (from a new conversation, read it first). Omit `capabilities` and `icon` on redeploys so they're kept. Never publish without `url`, which would create a second, empty app.
- User data lives in the artifact's db and survives republishes:
  - `cafes/<id>` holds your changes to a built-in cafe (+ its `log` array), or a whole record with `custom: true` for cafes the user added
  - `meta/settings`, `meta/route`
  - `photos/<id>`

  **Never rename these collections or fields, and never change how ids are made.** Built-in cafe ids are `stableId("L", licenseKey)` (`src/store/seed.ts`), and changing them orphans the user's data.

## Ground rules from the user
- **No cafe-data APIs** (no Google Places / Foursquare / OpenStreetMap data, no API keys). Cafes come from the built-in Seattle license list, pasted Google Maps shares (parsed, not an API), "spotted" entries, and imports.
- "Anywhere that might sell coffee" counts: coffee, bakery/bagel/breakfast, tea/boba, and other drink/snack bars.
- Updates must never need a re-install and must never lose data.
- The artifact frame blocks GPS, network fetches and street-map tiles. Don't build features that need them.

## Before publishing
1. Add a line to `src/lib/changelog.ts`.
2. `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`, `CHROMIUM_PATH=/opt/pw-browsers/chromium npm run test:e2e`.
3. Publish (see above), commit, and push.

## Conventions
- Pure logic in `src/lib/**` with Vitest tests in `tests/`. The store (`src/store/store.ts`) is tested with the localStorage backend.
- UI: React function components in `src/ui/`, with Tailwind tokens from `src/ui/styles.css` (`bg-card`, `text-muted`, `btn-primary`…), in both light and dark mode.
- No `confirm()`/`alert()` (they don't work in artifacts). Use `ConfirmButton`. Phone numbers get `CopyText`.
