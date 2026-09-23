import { getDb } from "@/db";
import { cafes, interactions, photos, settings } from "@/db/schema";
import type { Backup } from "@/app/actions";

export const dynamic = "force-dynamic";

export async function GET() {
  const db = await getDb();
  const backup: Backup = {
    app: "cafejobfinder3000",
    version: 1,
    exportedAt: new Date().toISOString(),
    cafes: await db.select().from(cafes),
    interactions: await db.select().from(interactions),
    photos: await db.select().from(photos),
    settings: await db.select().from(settings),
  };
  const day = backup.exportedAt.slice(0, 10);
  return new Response(JSON.stringify(backup), {
    headers: {
      "content-type": "application/json",
      "content-disposition": `attachment; filename="cafejobfinder-backup-${day}.json"`,
      "cache-control": "no-store",
    },
  });
}
