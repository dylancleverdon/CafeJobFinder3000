export const DAY_MS = 86_400_000;

export function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * DAY_MS);
}

export function endOfDay(d: Date): Date {
  const e = new Date(d);
  e.setHours(23, 59, 59, 999);
  return e;
}

export function startOfWeek(d: Date): Date {
  // Weeks start on Monday.
  const s = new Date(d);
  s.setHours(0, 0, 0, 0);
  const dow = (s.getDay() + 6) % 7;
  s.setDate(s.getDate() - dow);
  return s;
}

export function isDue(nextActionAt: Date | string | null | undefined, now: Date): boolean {
  if (!nextActionAt) return false;
  return new Date(nextActionAt).getTime() <= endOfDay(now).getTime();
}

/** "2026-09-30" (from <input type=date>) → that day at 9am local time. */
export function parseDateInput(value: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 9, 0, 0);
}

export function toDateInput(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function relativeDay(d: Date | string, now: Date): string {
  const target = new Date(d);
  const a = new Date(now);
  a.setHours(0, 0, 0, 0);
  const b = new Date(target);
  b.setHours(0, 0, 0, 0);
  const diff = Math.round((b.getTime() - a.getTime()) / DAY_MS);
  if (diff === 0) return "today";
  if (diff === 1) return "tomorrow";
  if (diff === -1) return "yesterday";
  if (diff < 0) return `${-diff} days ago`;
  if (diff < 7) return `in ${diff} days`;
  return target.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** License dates older than this many days don't count as a "new opening". */
export const NEW_OPENING_DAYS = 183;

export function isNewOpening(licenseStartDate: string | null | undefined, now: Date): boolean {
  if (!licenseStartDate) return false;
  const d = new Date(`${licenseStartDate}T00:00:00`);
  if (Number.isNaN(d.getTime())) return false;
  const age = (now.getTime() - d.getTime()) / DAY_MS;
  return age >= -30 && age <= NEW_OPENING_DAYS;
}
