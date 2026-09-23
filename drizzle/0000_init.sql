CREATE TABLE "cafes" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"legal_name" text,
	"address" text,
	"zip" text,
	"lat" double precision,
	"lng" double precision,
	"pin_quality" text DEFAULT 'none' NOT NULL,
	"geocode_tried" boolean DEFAULT false NOT NULL,
	"google_maps_url" text,
	"website" text,
	"instagram" text,
	"phone" text,
	"source" text DEFAULT 'manual' NOT NULL,
	"category" text DEFAULT 'coffee' NOT NULL,
	"naics" text,
	"license_key" text,
	"license_start_date" text,
	"may_have_closed" boolean DEFAULT false NOT NULL,
	"is_chain" boolean DEFAULT false NOT NULL,
	"hiring_sign" boolean DEFAULT false NOT NULL,
	"interest" integer DEFAULT 0 NOT NULL,
	"manager_name" text,
	"best_time_note" text,
	"stage" text DEFAULT 'discovered' NOT NULL,
	"next_action_at" timestamp with time zone,
	"no_answer_count" integer DEFAULT 0 NOT NULL,
	"hidden" boolean DEFAULT false NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cafes_license_key_unique" UNIQUE("license_key")
);
--> statement-breakpoint
CREATE TABLE "interactions" (
	"id" serial PRIMARY KEY NOT NULL,
	"cafe_id" integer NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"type" text NOT NULL,
	"contact_name" text,
	"outcome" text,
	"note" text
);
--> statement-breakpoint
CREATE TABLE "photos" (
	"id" serial PRIMARY KEY NOT NULL,
	"cafe_id" integer NOT NULL,
	"data_url" text NOT NULL,
	"taken_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"home_lat" double precision,
	"home_lng" double precision,
	"home_label" text,
	"window_start" text DEFAULT '14:00' NOT NULL,
	"window_end" text DEFAULT '16:00' NOT NULL,
	"weekly_goal" integer DEFAULT 10 NOT NULL,
	"follow_up_days" integer DEFAULT 6 NOT NULL,
	"follow_up_again_days" integer DEFAULT 7 NOT NULL,
	"revisit_days" integer DEFAULT 25 NOT NULL,
	"dwell_minutes" integer DEFAULT 10 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "interactions" ADD CONSTRAINT "interactions_cafe_id_cafes_id_fk" FOREIGN KEY ("cafe_id") REFERENCES "public"."cafes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "photos" ADD CONSTRAINT "photos_cafe_id_cafes_id_fk" FOREIGN KEY ("cafe_id") REFERENCES "public"."cafes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cafes_stage_idx" ON "cafes" USING btree ("stage");--> statement-breakpoint
CREATE INDEX "cafes_next_action_idx" ON "cafes" USING btree ("next_action_at");--> statement-breakpoint
CREATE INDEX "interactions_cafe_idx" ON "interactions" USING btree ("cafe_id");--> statement-breakpoint
CREATE INDEX "interactions_at_idx" ON "interactions" USING btree ("at");