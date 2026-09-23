import { describe, expect, it } from "vitest";
import { applyQuickAction, DEFAULT_FOLLOW_UP } from "@/lib/followup";
import { addDays, isDue, isNewOpening, parseDateInput } from "@/lib/dates";

const now = new Date(2026, 8, 23, 14, 30);
const days = (d: Date | null) => (d ? Math.round((d.getTime() - now.getTime()) / 86_400_000) : null);

describe("applyQuickAction", () => {
  it("dropping a resume schedules a follow-up in 6 days", () => {
    const r = applyQuickAction({ stage: "to_visit", noAnswerCount: 0 }, "dropped_resume", { now });
    expect(r.stage).toBe("applied");
    expect(days(r.nextActionAt)).toBe(DEFAULT_FOLLOW_UP.followUpDays);
    expect(r.interaction.type).toBe("resume_drop");
  });

  it("two unanswered follow-ups park the cafe in Revisit for 25 days", () => {
    const first = applyQuickAction({ stage: "applied", noAnswerCount: 0 }, "follow_up_no_answer", { now });
    expect(first).toMatchObject({ stage: "following_up", noAnswerCount: 1 });
    expect(days(first.nextActionAt)).toBe(7);
    const second = applyQuickAction({ stage: first.stage, noAnswerCount: first.noAnswerCount }, "follow_up_no_answer", { now });
    expect(second).toMatchObject({ stage: "revisit", noAnswerCount: 0 });
    expect(days(second.nextActionAt)).toBe(25);
  });

  it("not hiring → revisit in 25 days", () => {
    const r = applyQuickAction({ stage: "discovered", noAnswerCount: 0 }, "not_hiring", { now });
    expect(r.stage).toBe("revisit");
    expect(days(r.nextActionAt)).toBe(25);
  });

  it("come back on a date keeps an applied cafe applied", () => {
    const date = parseDateInput("2026-09-30")!;
    const r = applyQuickAction({ stage: "applied", noAnswerCount: 1 }, "come_back", { now, date });
    expect(r.stage).toBe("applied");
    expect(r.nextActionAt).toEqual(date);
    const fresh = applyQuickAction({ stage: "discovered", noAnswerCount: 0 }, "come_back", { now, date });
    expect(fresh.stage).toBe("to_visit");
  });

  it("dated actions require a date", () => {
    expect(() => applyQuickAction({ stage: "applied", noAnswerCount: 0 }, "trial_booked", { now })).toThrow();
    const date = parseDateInput("2026-09-25")!;
    expect(applyQuickAction({ stage: "applied", noAnswerCount: 0 }, "trial_booked", { now, date })).toMatchObject({ stage: "trial", nextActionAt: date });
  });

  it("honours custom settings", () => {
    const r = applyQuickAction({ stage: "to_visit", noAnswerCount: 0 }, "dropped_resume", { now, settings: { followUpDays: 3, followUpAgainDays: 4, revisitDays: 30 } });
    expect(days(r.nextActionAt)).toBe(3);
  });
});

describe("dates", () => {
  it("isDue counts anything up to the end of today", () => {
    expect(isDue(addDays(now, 0.3), now)).toBe(true);
    expect(isDue(addDays(now, -3), now)).toBe(true);
    expect(isDue(addDays(now, 1), now)).toBe(false);
    expect(isDue(null, now)).toBe(false);
  });

  it("new openings are licenses from the last ~6 months", () => {
    expect(isNewOpening("2026-06-01", now)).toBe(true);
    expect(isNewOpening("2025-01-01", now)).toBe(false);
    expect(isNewOpening(null, now)).toBe(false);
  });
});
