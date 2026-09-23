import Link from "next/link";
import { PageHeader } from "@/components/ui";
import { getSettings } from "@/lib/server/queries";
import { pinProgress, logout } from "@/app/actions";
import { CHANGELOG } from "@/lib/changelog";
import { authRequired } from "@/lib/auth";
import SettingsForm from "./SettingsForm";
import PinsPanel from "./PinsPanel";
import BackupPanel from "./BackupPanel";

export const dynamic = "force-dynamic";
// "Get exact map pins" and link lookups call out to the Census geocoder — give them time.
export const maxDuration = 60;

export default async function SettingsPage() {
  const [s, pins] = await Promise.all([getSettings(), pinProgress()]);
  const sha = process.env.NEXT_PUBLIC_BUILD_SHA ?? "dev";
  const builtAt = process.env.NEXT_PUBLIC_BUILD_TIME;
  return (
    <>
      <PageHeader title="Settings" />

      <PinsPanel initial={pins} />

      <SettingsForm settings={s} />

      <section className="card mb-4 p-4">
        <h2 className="font-semibold">Add more cafes</h2>
        <p className="mt-1 text-sm text-muted">Upload a newer Seattle license list, paste an article, or import another spreadsheet.</p>
        <Link href="/import" className="btn-ghost mt-3 w-full">
          Import
        </Link>
      </section>

      <BackupPanel />

      <section className="card mb-4 p-4">
        <h2 className="font-semibold">Put it on your home screen</h2>
        <ul className="mt-2 space-y-1 text-sm text-muted">
          <li>
            <b className="text-ink">iPhone:</b> Safari → Share → <i>Add to Home Screen</i>
          </li>
          <li>
            <b className="text-ink">Android:</b> Chrome → ⋮ → <i>Add to Home screen</i> / <i>Install app</i>. Then “Cafe Jobs” shows up when you share from Google Maps.
          </li>
        </ul>
        <p className="mt-2 text-xs text-muted">Updates arrive automatically — you&apos;ll see a “New version ready” banner. Nothing to re-download.</p>
      </section>

      <section className="card mb-4 p-4">
        <h2 className="font-semibold">What&apos;s new</h2>
        {CHANGELOG.map((c) => (
          <div key={c.date + c.title} className="mt-2">
            <p className="text-sm font-medium">
              {c.title} <span className="text-xs text-muted">· {c.date}</span>
            </p>
            <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-muted">
              {c.items.map((i) => (
                <li key={i}>{i}</li>
              ))}
            </ul>
          </div>
        ))}
        <p className="mt-3 text-xs text-muted">
          Version {sha.slice(0, 7)}
          {builtAt ? ` · built ${new Date(builtAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}` : ""}
        </p>
      </section>

      {authRequired() && (
        <form action={logout} className="mb-4">
          <button className="btn-ghost w-full">Sign out</button>
        </form>
      )}
    </>
  );
}
