"use client";

import { useEffect, useState } from "react";

const LOADED_SHA = process.env.NEXT_PUBLIC_BUILD_SHA ?? "dev";

/**
 * Checks /api/version when the app opens or comes back to the foreground.
 * If a newer version has been deployed, offers a one-tap refresh — no
 * re-installing, and your data stays put (it lives in the database).
 */
export default function UpdateBanner() {
  const [newSha, setNewSha] = useState<string | null>(null);

  useEffect(() => {
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
    let stopped = false;
    const check = async () => {
      try {
        const res = await fetch("/api/version", { cache: "no-store" });
        const { sha } = (await res.json()) as { sha: string };
        if (!stopped && sha && sha !== LOADED_SHA) setNewSha(sha);
      } catch {
        /* offline — try again later */
      }
    };
    check();
    const onVisible = () => document.visibilityState === "visible" && check();
    document.addEventListener("visibilitychange", onVisible);
    const timer = setInterval(check, 30 * 60_000);
    return () => {
      stopped = true;
      document.removeEventListener("visibilitychange", onVisible);
      clearInterval(timer);
    };
  }, []);

  if (!newSha) return null;
  return (
    <button
      type="button"
      onClick={() => window.location.reload()}
      className="sticky top-0 z-[1100] flex w-full items-center justify-center gap-2 bg-accent px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))] text-sm font-semibold text-accent-ink"
      data-testid="update-banner"
    >
      ✨ New version ready — tap to update
    </button>
  );
}
