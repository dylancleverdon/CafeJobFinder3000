import type { Category, Stage } from "@/db/schema";

export const STAGE_LABEL: Record<Stage, string> = {
  discovered: "Discovered",
  to_visit: "To visit",
  applied: "Applied",
  following_up: "Following up",
  trial: "Trial / interview",
  offer: "Offer",
  revisit: "Revisit later",
  closed: "Closed",
};

// Tailwind classes for stage chips / map pins.
export const STAGE_COLOR: Record<Stage, { chip: string; hex: string }> = {
  discovered: { chip: "bg-stone-200 text-stone-800 dark:bg-stone-700 dark:text-stone-100", hex: "#a8a29e" },
  to_visit: { chip: "bg-sky-100 text-sky-900 dark:bg-sky-900 dark:text-sky-100", hex: "#0284c7" },
  applied: { chip: "bg-amber-100 text-amber-900 dark:bg-amber-900 dark:text-amber-100", hex: "#d97706" },
  following_up: { chip: "bg-orange-100 text-orange-900 dark:bg-orange-900 dark:text-orange-100", hex: "#ea580c" },
  trial: { chip: "bg-violet-100 text-violet-900 dark:bg-violet-900 dark:text-violet-100", hex: "#7c3aed" },
  offer: { chip: "bg-emerald-100 text-emerald-900 dark:bg-emerald-900 dark:text-emerald-100", hex: "#059669" },
  revisit: { chip: "bg-slate-200 text-slate-800 dark:bg-slate-700 dark:text-slate-100", hex: "#64748b" },
  closed: { chip: "bg-zinc-200 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400", hex: "#71717a" },
};

export const CATEGORY_LABEL: Record<Category, string> = {
  coffee: "Coffee",
  bakery: "Bakery & breakfast",
  tea: "Tea & boba",
  other: "Other drinks & snacks",
};

export const CATEGORY_ORDER: Record<Category, number> = { coffee: 0, bakery: 1, tea: 2, other: 3 };
