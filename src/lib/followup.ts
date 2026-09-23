import type { InteractionType, Stage } from "@/lib/types";
import { addDays } from "./dates";

export const QUICK_ACTIONS = [
  "dropped_resume",
  "talked_to_manager",
  "not_hiring",
  "come_back",
  "follow_up_no_answer",
  "trial_booked",
  "offer",
  "to_visit",
  "closed",
] as const;
export type QuickAction = (typeof QUICK_ACTIONS)[number];

export const QUICK_ACTION_LABEL: Record<QuickAction, string> = {
  dropped_resume: "Dropped resume",
  talked_to_manager: "Talked to manager",
  not_hiring: "Not hiring",
  come_back: "Come back on…",
  follow_up_no_answer: "Followed up, no answer",
  trial_booked: "Trial / interview booked",
  offer: "Got an offer",
  to_visit: "Want to visit",
  closed: "Not a fit",
};

/** Actions that need a date picked first. */
export const NEEDS_DATE: ReadonlySet<QuickAction> = new Set(["come_back", "trial_booked"]);

export type FollowUpSettings = { followUpDays: number; followUpAgainDays: number; revisitDays: number };

export const DEFAULT_FOLLOW_UP: FollowUpSettings = { followUpDays: 6, followUpAgainDays: 7, revisitDays: 25 };

/** After this many follow-ups with no answer, park the cafe in "Revisit later". */
export const MAX_NO_ANSWER = 2;

export type QuickActionResult = {
  stage: Stage;
  nextActionAt: Date | null;
  noAnswerCount: number;
  interaction: { type: InteractionType; outcome: string };
};

export function applyQuickAction(
  current: { stage: Stage; noAnswerCount: number },
  action: QuickAction,
  ctx: { now: Date; date?: Date | null; settings?: FollowUpSettings },
): QuickActionResult {
  const s = ctx.settings ?? DEFAULT_FOLLOW_UP;
  const now = ctx.now;
  switch (action) {
    case "dropped_resume":
      return { stage: "applied", nextActionAt: addDays(now, s.followUpDays), noAnswerCount: 0, interaction: { type: "resume_drop", outcome: "Dropped off resume" } };
    case "talked_to_manager":
      return { stage: "applied", nextActionAt: addDays(now, s.followUpDays), noAnswerCount: 0, interaction: { type: "walk_in", outcome: "Talked to the manager" } };
    case "not_hiring":
      return { stage: "revisit", nextActionAt: addDays(now, s.revisitDays), noAnswerCount: 0, interaction: { type: "walk_in", outcome: "Not hiring right now" } };
    case "come_back": {
      if (!ctx.date) throw new Error("Pick a date to come back");
      const stage: Stage = current.stage === "applied" || current.stage === "following_up" ? current.stage : "to_visit";
      return { stage, nextActionAt: ctx.date, noAnswerCount: current.noAnswerCount, interaction: { type: "walk_in", outcome: `Told to come back ${ctx.date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}` } };
    }
    case "follow_up_no_answer": {
      const count = current.noAnswerCount + 1;
      if (count >= MAX_NO_ANSWER) {
        return { stage: "revisit", nextActionAt: addDays(now, s.revisitDays), noAnswerCount: 0, interaction: { type: "follow_up", outcome: `No answer (${count} follow-ups) — check back later` } };
      }
      return { stage: "following_up", nextActionAt: addDays(now, s.followUpAgainDays), noAnswerCount: count, interaction: { type: "follow_up", outcome: "Followed up, no answer yet" } };
    }
    case "trial_booked": {
      if (!ctx.date) throw new Error("Pick the trial / interview date");
      return { stage: "trial", nextActionAt: ctx.date, noAnswerCount: 0, interaction: { type: "trial", outcome: `Trial / interview booked for ${ctx.date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}` } };
    }
    case "offer":
      return { stage: "offer", nextActionAt: null, noAnswerCount: 0, interaction: { type: "note", outcome: "Got an offer! 🎉" } };
    case "to_visit":
      return { stage: "to_visit", nextActionAt: null, noAnswerCount: current.noAnswerCount, interaction: { type: "stage_change", outcome: "Added to visit list" } };
    case "closed":
      return { stage: "closed", nextActionAt: null, noAnswerCount: 0, interaction: { type: "stage_change", outcome: "Marked not a fit" } };
  }
}

/** Interaction types that count toward the weekly outreach goal. */
export const OUTREACH_TYPES: ReadonlySet<InteractionType> = new Set(["walk_in", "resume_drop", "follow_up", "call", "email", "dm", "trial"]);
