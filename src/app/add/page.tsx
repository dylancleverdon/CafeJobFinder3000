import AddCafe from "./AddCafe";

// Reading short links / looking up addresses calls out to other sites — give them time.
export const maxDuration = 60;

export default async function AddPage({ searchParams }: { searchParams: Promise<{ tab?: string; text?: string; title?: string; url?: string }> }) {
  const sp = await searchParams;
  // Android share sheet sends ?title=&text=&url= (see manifest.webmanifest).
  const shared = [sp.text, sp.url].filter(Boolean).join("\n");
  const tab = sp.tab === "spotted" || sp.tab === "manual" ? sp.tab : "link";
  return <AddCafe initialTab={shared ? "link" : tab} sharedText={shared} sharedTitle={sp.title ?? null} />;
}
