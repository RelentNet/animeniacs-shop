CREATE TABLE IF NOT EXISTS "event_logos" (
	"hashtag" text PRIMARY KEY NOT NULL,
	"image_url" text NOT NULL,
	"source" text NOT NULL,
	"source_event_url" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text,
	CONSTRAINT "event_logos_source_valid" CHECK ("event_logos"."source" IN ('scraped', 'manual_upload', 'manual_override'))
);
