"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/", label: "Today", icon: "M3 12l9-8 9 8M5 10v10h5v-6h4v6h5V10" },
  { href: "/cafes", label: "Cafes", icon: "M4 8h13v5a6 6 0 01-6 6h-1a6 6 0 01-6-6V8zm13 1h1.5a2.5 2.5 0 010 5H17M7 3v2m4-2v2m4-2v2" },
  { href: "/add", label: "Add", icon: "M12 5v14M5 12h14" },
  { href: "/route", label: "Route", icon: "M6 19a2 2 0 100-4 2 2 0 000 4zm12-10a2 2 0 100-4 2 2 0 000 4zM6 15V9a4 4 0 014-4h6M18 9v6a4 4 0 01-4 4H8" },
  { href: "/settings", label: "More", icon: "M5 12h.01M12 12h.01M19 12h.01" },
];

export default function BottomNav() {
  const path = usePathname();
  if (path.startsWith("/login")) return null;
  return (
    <nav className="fixed inset-x-0 bottom-0 z-[1000] border-t border-line bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
      <ul className="mx-auto grid max-w-xl grid-cols-5">
        {TABS.map((t) => {
          const active = t.href === "/" ? path === "/" : path.startsWith(t.href);
          return (
            <li key={t.href}>
              <Link
                href={t.href}
                className={`flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium ${active ? "text-accent" : "text-muted"}`}
                aria-current={active ? "page" : undefined}
              >
                <svg viewBox="0 0 24 24" className={`h-6 w-6 ${t.href === "/add" ? "rounded-full bg-accent p-0.5 text-accent-ink" : ""}`} fill="none" stroke="currentColor" strokeWidth={t.href === "/add" ? 2.5 : 1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d={t.icon} />
                </svg>
                {t.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
