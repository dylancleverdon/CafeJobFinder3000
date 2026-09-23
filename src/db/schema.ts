import {
  boolean,
  doublePrecision,
  index,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

export const STAGES = [
  "discovered",
  "to_visit",
  "applied",
  "following_up",
  "trial",
  "offer",
  "revisit",
  "closed",
] as const;
export type Stage = (typeof STAGES)[number];

export const CATEGORIES = ["coffee", "bakery", "tea", "other"] as const;
export type Category = (typeof CATEGORIES)[number];

export const PIN_QUALITIES = ["exact", "approximate", "none"] as const;
export type PinQuality = (typeof PIN_QUALITIES)[number];

export const SOURCES = ["license", "gmaps", "spotted", "csv", "paste", "manual"] as const;
export type Source = (typeof SOURCES)[number];

export const INTERACTION_TYPES = [
  "walk_in",
  "resume_drop",
  "follow_up",
  "call",
  "email",
  "dm",
  "trial",
  "note",
  "stage_change",
] as const;
export type InteractionType = (typeof INTERACTION_TYPES)[number];

export const cafes = pgTable(
  "cafes",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    legalName: text("legal_name"),
    address: text("address"),
    zip: text("zip"),
    lat: doublePrecision("lat"),
    lng: doublePrecision("lng"),
    pinQuality: text("pin_quality").$type<PinQuality>().notNull().default("none"),
    geocodeTried: boolean("geocode_tried").notNull().default(false),
    googleMapsUrl: text("google_maps_url"),
    website: text("website"),
    instagram: text("instagram"),
    phone: text("phone"),
    source: text("source").$type<Source>().notNull().default("manual"),
    category: text("category").$type<Category>().notNull().default("coffee"),
    naics: text("naics"),
    licenseKey: text("license_key").unique(),
    licenseStartDate: text("license_start_date"),
    mayHaveClosed: boolean("may_have_closed").notNull().default(false),
    isChain: boolean("is_chain").notNull().default(false),
    hiringSign: boolean("hiring_sign").notNull().default(false),
    interest: integer("interest").notNull().default(0),
    managerName: text("manager_name"),
    bestTimeNote: text("best_time_note"),
    stage: text("stage").$type<Stage>().notNull().default("discovered"),
    nextActionAt: timestamp("next_action_at", { withTimezone: true }),
    noAnswerCount: integer("no_answer_count").notNull().default(0),
    hidden: boolean("hidden").notNull().default(false),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("cafes_stage_idx").on(t.stage), index("cafes_next_action_idx").on(t.nextActionAt)],
);

export const interactions = pgTable(
  "interactions",
  {
    id: serial("id").primaryKey(),
    cafeId: integer("cafe_id")
      .notNull()
      .references(() => cafes.id, { onDelete: "cascade" }),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
    type: text("type").$type<InteractionType>().notNull(),
    contactName: text("contact_name"),
    outcome: text("outcome"),
    note: text("note"),
  },
  (t) => [index("interactions_cafe_idx").on(t.cafeId), index("interactions_at_idx").on(t.at)],
);

export const photos = pgTable("photos", {
  id: serial("id").primaryKey(),
  cafeId: integer("cafe_id")
    .notNull()
    .references(() => cafes.id, { onDelete: "cascade" }),
  // JPEG as a data: URL. Photos are downscaled in the browser to ~150 KB first.
  dataUrl: text("data_url").notNull(),
  takenAt: timestamp("taken_at", { withTimezone: true }).notNull().defaultNow(),
});

export const settings = pgTable("settings", {
  id: integer("id").primaryKey().default(1),
  homeLat: doublePrecision("home_lat"),
  homeLng: doublePrecision("home_lng"),
  homeLabel: text("home_label"),
  windowStart: text("window_start").notNull().default("14:00"),
  windowEnd: text("window_end").notNull().default("16:00"),
  weeklyGoal: integer("weekly_goal").notNull().default(10),
  followUpDays: integer("follow_up_days").notNull().default(6),
  followUpAgainDays: integer("follow_up_again_days").notNull().default(7),
  revisitDays: integer("revisit_days").notNull().default(25),
  dwellMinutes: integer("dwell_minutes").notNull().default(10),
});

export type Cafe = typeof cafes.$inferSelect;
export type NewCafe = typeof cafes.$inferInsert;
export type Interaction = typeof interactions.$inferSelect;
export type Settings = typeof settings.$inferSelect;
