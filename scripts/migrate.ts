// Runs on every deploy (see "build" in package.json). Applies any new
// migrations in drizzle/ to the production database. Migrations only ever add
// things, so deploying an update never wipes cafes, notes or stages.
import path from "node:path";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";

const url = process.env.DATABASE_URL;
if (!url) {
  console.log("[migrate] No DATABASE_URL set — skipping (the local database migrates itself).");
  process.exit(0);
}

const client = postgres(url, { prepare: false, max: 1 });
await migrate(drizzle({ client }), { migrationsFolder: path.join(process.cwd(), "drizzle") });
await client.end();
console.log("[migrate] Database is up to date.");
