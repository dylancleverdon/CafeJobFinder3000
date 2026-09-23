"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { loadSeattleSeed } from "./actions";

export default function FirstRun() {
  const [pending, start] = useTransition();
  const [done, setDone] = useState<number | null>(null);
  return (
    <div className="space-y-3">
      <div className="card p-5">
        <p className="text-lg font-semibold">Start with 988 Seattle spots</p>
        <p className="mt-1 text-sm text-muted">
          Every coffee shop, bakery, bagel shop, tea bar and snack bar with an active Seattle business license — from the city&apos;s public list (Sept 2026). No
          apps or APIs needed.
        </p>
        <button className="btn-primary mt-4 w-full" disabled={pending || done != null} onClick={() => start(async () => setDone((await loadSeattleSeed()).added))}>
          {pending ? "Loading…" : done != null ? `Loaded ${done} places ✓` : "Load Seattle cafes"}
        </button>
      </div>
      <div className="card p-5">
        <p className="font-semibold">Or add your own</p>
        <p className="mt-1 text-sm text-muted">Share a cafe from Google Maps, snap one you spot on the street, or import a list.</p>
        <div className="mt-3 flex gap-2">
          <Link href="/add" className="btn-ghost flex-1">
            Add a cafe
          </Link>
          <Link href="/import" className="btn-ghost flex-1">
            Import a list
          </Link>
        </div>
      </div>
    </div>
  );
}
