# CafeJobFinder3000 — notes for Claude

Personal, phone-first barista job-hunt CRM for one user in Seattle. The user is not a developer. Keep changes simple and explain them in plain words.

## Ground rules from the user
- **No cafe-data APIs** (no Google Places / Foursquare / OpenStreetMap data, no API keys). Cafes come from the Seattle license CSV, Google Maps *share links* (parsed, not an API), GPS "spotted", and pasted/imported lists. The only outside call is the free U.S. Census geocoder, and it's only used to turn addresses into pins.
- "Anywhere that might sell coffee" counts: coffee, bakery/bagel/breakfast, tea/boba, and other drink/snack bars (`src/lib/import/seattleLicense.ts`).
- Updates must never need a re-install and must never lose data.

## Shipping an update
1. Make the change on a branch. Add a line to `src/lib/changelog.ts`.
2. Schema change → `npm run db:generate` and commit `drizzle/`. **Additive only** (new columns need defaults; never drop or rename).
3. Run `npm test`, `npm run typecheck`, `npm run lint`, and for UI changes `npm run build && CHROMIUM_PATH=/opt/pw-browsers/chromium npm run test:e2e`.
4. Open a PR. Vercel posts a preview link for the user to try on their phone. Merging to the production branch auto-deploys; the in-app banner (`/api/version`) tells the phone to refresh.

## Conventions
- Next.js 16: `src/proxy.ts` (not middleware), async `params`/`searchParams`, server actions in `src/app/actions.ts`. Read `node_modules/next/dist/docs/` before using unfamiliar APIs.
- Pure logic lives in `src/lib/**` with Vitest tests in `tests/`. UI is Tailwind 4 using the tokens in `src/app/globals.css` (`bg-card`, `text-muted`, `btn-primary`, …).
- Local DB is PGlite in `.data/` (auto-migrates). Production is Neon via `DATABASE_URL`, migrated at build time by `scripts/migrate.ts`.
