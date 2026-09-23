import path from "node:path";
import fs from "node:fs";
import { drizzle as drizzlePostgres, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export type Db = PostgresJsDatabase<typeof schema>;

const MIGRATIONS = path.join(process.cwd(), "drizzle");

// One connection per server process. Kept on globalThis so dev hot-reloads
// don't open a second handle on the local database folder.
const g = globalThis as unknown as { __cafeDb?: Promise<Db> };

async function createLocalDb(): Promise<Db> {
  // Local/dev/test: PGlite (Postgres compiled to WASM) — no install needed.
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const dir = process.env.PGLITE_DIR ?? path.join(process.cwd(), ".data", "pglite");
  let client;
  if (dir === "memory://") {
    client = new PGlite();
  } else {
    fs.mkdirSync(dir, { recursive: true });
    client = new PGlite(dir);
  }
  const db = drizzle({ client, schema });
  await migrate(db, { migrationsFolder: MIGRATIONS });
  return db as unknown as Db;
}

function createRemoteDb(url: string): Db {
  // Production: Neon Postgres (Vercel integration). Migrations run at build
  // time via scripts/migrate.ts, so nothing to do here.
  const client = postgres(url, { prepare: false, max: 1 });
  return drizzlePostgres({ client, schema });
}

export function getDb(): Promise<Db> {
  if (!g.__cafeDb) {
    const url = process.env.DATABASE_URL;
    if (!url && process.env.VERCEL) {
      // Serverless file systems are read-only, so the local database can't work there.
      throw new Error("No database connected yet. In Vercel: Storage → Create → Neon (Postgres) → connect it to this project, then Redeploy.");
    }
    g.__cafeDb = url ? Promise.resolve(createRemoteDb(url)) : createLocalDb();
  }
  return g.__cafeDb;
}

export { schema };
