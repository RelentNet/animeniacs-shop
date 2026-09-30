CREATE TABLE IF NOT EXISTS "artist_commission_rates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"artist_id" uuid NOT NULL,
	"rate" numeric(5, 4) NOT NULL,
	"effective_from" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "artist_commission_rates_artist_from_unique" UNIQUE("artist_id","effective_from")
);
--> statement-breakpoint
ALTER TABLE "commission_earnings" ADD COLUMN "rate" numeric(5, 4);--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "artist_commission_rates" ADD CONSTRAINT "artist_commission_rates_artist_id_artists_id_fk" FOREIGN KEY ("artist_id") REFERENCES "public"."artists"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
-- Backfill: one row per existing artist at its current rate, effective before any sales,
-- so the next sync reproduces today's commission_cents exactly.
INSERT INTO "artist_commission_rates" ("artist_id", "rate", "effective_from")
SELECT "id", "commission_rate", '2000-01' FROM "artists";
