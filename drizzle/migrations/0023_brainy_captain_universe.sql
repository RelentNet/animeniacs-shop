CREATE TABLE IF NOT EXISTS "artist_profile_changes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"artist_id" uuid NOT NULL,
	"field" text NOT NULL,
	"old_value" text,
	"new_value" text,
	"changed_by_user_id" text,
	"changed_by_email" text,
	"source" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "artist_profile_changes_source_valid" CHECK ("artist_profile_changes"."source" IN ('artist', 'admin'))
);
--> statement-breakpoint
ALTER TABLE "artists" ADD COLUMN "payment_review_pending_at" timestamp with time zone;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "artist_profile_changes" ADD CONSTRAINT "artist_profile_changes_artist_id_artists_id_fk" FOREIGN KEY ("artist_id") REFERENCES "public"."artists"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "artist_profile_changes_artist_idx" ON "artist_profile_changes" USING btree ("artist_id","created_at");