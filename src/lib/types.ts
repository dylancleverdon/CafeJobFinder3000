export const STAGES = ["discovered", "to_visit", "applied", "following_up", "trial", "offer", "revisit", "closed"] as const;
export type Stage = (typeof STAGES)[number];

export const CATEGORIES = ["coffee", "bakery", "tea", "other"] as const;
export type Category = (typeof CATEGORIES)[number];

export type PinQuality = "exact" | "approximate" | "none";

export const SOURCES = ["license", "gmaps", "spotted", "csv", "paste", "manual"] as const;
export type Source = (typeof SOURCES)[number];

export const INTERACTION_TYPES = ["walk_in", "resume_drop", "follow_up", "call", "email", "dm", "trial", "note", "stage_change"] as const;
export type InteractionType = (typeof INTERACTION_TYPES)[number];

export type LogEntry = {
  id: string;
  at: string; // ISO time
  type: InteractionType;
  contactName: string | null;
  outcome: string | null;
  note: string | null;
};

export type Cafe = {
  id: string;
  name: string;
  legalName: string | null;
  address: string | null;
  zip: string | null;
  lat: number | null;
  lng: number | null;
  pinQuality: PinQuality;
  googleMapsUrl: string | null;
  website: string | null;
  instagram: string | null;
  phone: string | null;
  source: Source;
  category: Category;
  naics: string | null;
  licenseKey: string | null;
  licenseStartDate: string | null;
  mayHaveClosed: boolean;
  isChain: boolean;
  hiringSign: boolean;
  interest: number;
  managerName: string | null;
  bestTimeNote: string | null;
  stage: Stage;
  nextActionAt: string | null; // ISO time
  noAnswerCount: number;
  hidden: boolean;
  notes: string | null;
  log: LogEntry[]; // newest first
  createdAt: string | null;
  updatedAt: string | null;
};

export type Settings = {
  homeZip: string | null;
  windowStart: string;
  windowEnd: string;
  weeklyGoal: number;
  followUpDays: number;
  followUpAgainDays: number;
  revisitDays: number;
  dwellMinutes: number;
};

export const DEFAULT_SETTINGS: Settings = {
  homeZip: null,
  windowStart: "14:00",
  windowEnd: "16:00",
  weeklyGoal: 10,
  followUpDays: 6,
  followUpAgainDays: 7,
  revisitDays: 25,
  dwellMinutes: 10,
};

export type Photo = { id: string; cafeId: string; dataUrl: string; takenAt: string };
