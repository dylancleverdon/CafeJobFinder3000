import { createContext, useCallback, useContext, useMemo, useState } from "react";

export type Route =
  | { name: "today" }
  | { name: "cafes" }
  | { name: "cafe"; id: string }
  | { name: "add"; tab?: "link" | "spotted" | "manual" }
  | { name: "route"; ids?: string[] }
  | { name: "more" }
  | { name: "import" };

type Nav = { route: Route; go: (r: Route) => void; back: () => void; canGoBack: boolean };
const RouterContext = createContext<Nav | null>(null);

/** Screen switching kept in memory (the app runs inside Claude, so there's no address bar to use). */
export function RouterProvider({ children, initial = { name: "today" } }: { children: React.ReactNode; initial?: Route }) {
  const [stack, setStack] = useState<Route[]>([initial]);
  const go = useCallback((r: Route) => {
    setStack((s) => (["today", "cafes", "add", "route", "more"].includes(r.name) ? [r] : [...s, r]));
    window.scrollTo({ top: 0 });
  }, []);
  const back = useCallback(() => {
    setStack((s) => (s.length > 1 ? s.slice(0, -1) : s));
    window.scrollTo({ top: 0 });
  }, []);
  const value = useMemo(() => ({ route: stack[stack.length - 1], go, back, canGoBack: stack.length > 1 }), [stack, go, back]);
  return <RouterContext.Provider value={value}>{children}</RouterContext.Provider>;
}

export function useNav(): Nav {
  const nav = useContext(RouterContext);
  if (!nav) throw new Error("useNav outside RouterProvider");
  return nav;
}

export function NavButton({ to, className, children, ...rest }: { to: Route; className?: string; children: React.ReactNode } & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "onClick">) {
  const { go } = useNav();
  return (
    <button type="button" className={className} onClick={() => go(to)} {...rest}>
      {children}
    </button>
  );
}
