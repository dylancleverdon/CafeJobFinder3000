import { useEffect, useState } from "react";
import { NavButton, useNav, type Route } from "./router";
import { checkForUpdate, markStarted } from "./updater";
import { useAppState, useStoreApi } from "./useStore";
import Today from "./screens/Today";
import Cafes from "./screens/Cafes";
import CafeDetail from "./screens/CafeDetail";
import Add from "./screens/Add";
import Import from "./screens/Import";
import RouteScreen from "./screens/Route";
import More from "./screens/More";

const TABS: { to: Route; label: string; icon: string }[] = [
  { to: { name: "today" }, label: "Today", icon: "M3 12l9-8 9 8M5 10v10h5v-6h4v6h5V10" },
  { to: { name: "cafes" }, label: "Cafes", icon: "M4 8h13v5a6 6 0 01-6 6h-1a6 6 0 01-6-6V8zm13 1h1.5a2.5 2.5 0 010 5H17M7 3v2m4-2v2m4-2v2" },
  { to: { name: "add" }, label: "Add", icon: "M12 5v14M5 12h14" },
  { to: { name: "route" }, label: "Route", icon: "M6 19a2 2 0 100-4 2 2 0 000 4zm12-10a2 2 0 100-4 2 2 0 000 4zM6 15V9a4 4 0 014-4h6M18 9v6a4 4 0 01-4 4H8" },
  { to: { name: "more" }, label: "More", icon: "M5 12h.01M12 12h.01M19 12h.01" },
];

const TAB_OF: Record<Route["name"], Route["name"]> = { today: "today", cafes: "cafes", cafe: "cafes", add: "add", route: "route", more: "more", import: "more" };

function Screen() {
  const { route } = useNav();
  switch (route.name) {
    case "today":
      return <Today />;
    case "cafes":
      return <Cafes />;
    case "cafe":
      return <CafeDetail key={route.id} id={route.id} />;
    case "add":
      return <Add key={route.tab ?? "link"} initialTab={route.tab} />;
    case "import":
      return <Import />;
    case "route":
      return <RouteScreen />;
    case "more":
      return <More />;
  }
}

export default function App() {
  const { ready, error } = useAppState();
  const store = useStoreApi();
  const { route } = useNav();
  const current = TAB_OF[route.name];
  const [update, setUpdate] = useState<string | null>(null);

  useEffect(() => {
    if (!ready) return;
    markStarted();
    let live = true;
    const check = () => checkForUpdate().then((v) => live && v && setUpdate(v));
    check();
    const onVisible = () => document.visibilityState === "visible" && check();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      live = false;
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [ready]);

  return (
    <div className="min-h-full bg-bg font-sans text-ink antialiased">
      {update && (
        <button type="button" onClick={() => location.reload()} className="sticky top-[env(safe-area-inset-top,0px)] z-20 w-full bg-accent px-4 py-3 text-sm font-semibold text-accent-ink" data-testid="update-banner">
          ✨ New version ready — tap to update
        </button>
      )}
      {error && (
        <button type="button" onClick={store.dismissError} className="sticky top-[env(safe-area-inset-top,0px)] z-20 w-full bg-danger px-4 py-3 text-left text-sm font-semibold text-white">
          {error} <span className="opacity-80">(tap to dismiss)</span>
        </button>
      )}
      <main className="mx-auto w-full max-w-xl px-4 pt-4 pb-28">
        {ready ? (
          <Screen />
        ) : (
          <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
            <div className="text-4xl" aria-hidden>
              ☕
            </div>
            <p className="mt-2 font-semibold">Opening your cafes…</p>
          </div>
        )}
      </main>
      <nav className="fixed inset-x-0 bottom-0 z-10 border-t border-line bg-card pb-[env(safe-area-inset-bottom,0px)]" aria-label="Main">
        <ul className="mx-auto grid max-w-xl grid-cols-5">
          {TABS.map((t) => {
            const active = t.to.name === current;
            return (
              <li key={t.label}>
                <NavButton to={t.to} className={`flex w-full flex-col items-center gap-0.5 py-2 text-[11px] font-medium ${active ? "text-accent" : "text-muted"}`} aria-current={active ? "page" : undefined}>
                  <svg
                    viewBox="0 0 24 24"
                    className={`h-6 w-6 ${t.label === "Add" ? "rounded-full bg-accent p-0.5 text-accent-ink" : ""}`}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={t.label === "Add" ? 2.5 : 1.8}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden
                  >
                    <path d={t.icon} />
                  </svg>
                  {t.label}
                </NavButton>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
