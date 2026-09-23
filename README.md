# ☕ Cafe Job Finder 3000

A phone-first personal CRM for landing a barista job in Seattle **without job boards**:

- **Find cafes with no APIs.** Starts with ~988 Seattle coffee shops, bakeries, bagel shops, tea bars and snack bars from the city's public business-license list. You can also share cafes from Google Maps, snap ones you spot on the street (GPS + photo + "Now hiring" flag), or paste/import lists.
- **Track outreach.** Discovered → To visit → Applied → Following up → Trial → Offer (plus *Revisit later*). One tap logs a walk-in ("Dropped resume", "Not hiring", "Come back Thursday"…) and schedules the next follow-up automatically.
- **Plan walk-in routes.** Walk, drive, or **drive + walk** (park once per neighborhood and walk the cafes there), timed for the quiet 2–4 PM window. "Navigate" hands each leg to Google Maps.

---

## One-time setup (about 15 minutes)

You need a free [Vercel](https://vercel.com) account (sign in with GitHub).

1. **Import the repo.** Vercel → *Add New… → Project* → pick `CafeJobFinder3000` → **Import**.
2. **Set your password.** Before clicking Deploy, open *Environment Variables* and add
   `APP_PASSWORD` = the password you want to type to open the app. Then **Deploy**.
3. **Add the database.** In the project: *Storage → Create Database → Neon (Postgres)* → connect it to the project (all environments). This adds `DATABASE_URL` for you.
4. **Redeploy** (*Deployments → ⋯ → Redeploy*). The build creates the database tables automatically.
5. **On your phone**, open the Vercel URL, log in, and add it to your home screen:
   - iPhone: Safari → Share → *Add to Home Screen*
   - Android: Chrome → ⋮ → *Install app* (then "Cafe Jobs" appears in Google Maps' share menu)
6. In the app: **Load Seattle cafes** (Today tab), then **More → Get exact map pins**. That looks up each address once with the U.S. Census Bureau's free address lookup (no key, no account). Until then cafes sit at the center of their ZIP code.

## Updating the app (no re-downloading, ever)

It's a web app on your home screen, so updates just show up:

1. Ask Claude for a change. Claude pushes a branch and opens a pull request. Vercel posts a **preview link** on it so you can try the change on your phone first.
2. Happy with it? Say "ship it" (or press **Merge** on GitHub).
3. Vercel deploys in about a minute. Next time you open the app you'll see **"✨ New version ready — tap to update"**. Tap it and you're done.

Your cafes, notes and history live in the database, not in the app, so updates never touch them. Database changes are applied automatically on each deploy (`scripts/migrate.ts`), and they only ever add things. For extra peace of mind: **More → Download backup**.

## Updating the cafe list

Seattle refreshes the license export regularly. Download the newest *Active Business License Tax Certificate* CSV from [data.seattle.gov](https://data.seattle.gov/browse?q=Active%20Business%20License%20Tax%20Certificate) and upload it in **More → Import → Seattle business licenses**. You'll see how many are new and how many disappeared *before* anything changes. New places get added; missing ones get a "may have closed" badge (never deleted); your notes and stages are never overwritten.

---

## For developers

```bash
npm install
npm run dev          # http://localhost:3000 — uses a built-in local database in .data/ (no setup)
npm test             # unit tests (Vitest)
npm run typecheck && npm run lint
npm run build && npm run test:e2e   # phone-sized Playwright smoke test
```

- **Stack:** Next.js 16 (App Router, server actions) · React 19 · Tailwind 4 · Drizzle ORM · Postgres (Neon in production, [PGlite](https://pglite.dev) locally) · Leaflet.
- **Where things are:**
  - `src/lib/import/seattleLicense.ts` decides what counts as "might sell coffee" (NAICS codes + name keywords)
  - `src/lib/followup.ts` has the follow-up rules; `src/lib/route/` is the route planner (no routing APIs: straight-line distance × detour factor, exact ordering up to 11 stops, 2-opt beyond)
  - `src/lib/gmaps-link.ts` reads Google Maps share links; `src/lib/geocode/` has the Census lookup and ZIP centers
  - `src/app/actions.ts` holds every server action
- **Schema change?** Edit `src/db/schema.ts`, then run `npm run db:generate` and commit the new file in `drizzle/`. Keep changes additive (new columns get defaults).
- **Rebuild the starter list:** put the license CSV in `data/raw/`, then `npm run seed:build`.
- **What's new list:** add an entry to `src/lib/changelog.ts` with each user-facing change.
- **Env vars:** `APP_PASSWORD` (required in production), `DATABASE_URL` (set by the Vercel/Neon integration). Locally, leave both empty and there's no login.
- **Map background:** CARTO/OpenStreetMap tiles are only the picture behind the pins. No cafe data comes from them.
