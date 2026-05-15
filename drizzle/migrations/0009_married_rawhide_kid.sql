CREATE TABLE IF NOT EXISTS "artists" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"display_name" text NOT NULL,
	"square_category_id" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"avatar_url" text,
	"bio" text,
	"instagram" text,
	"twitter" text,
	"facebook" text,
	"youtube" text,
	"tiktok" text,
	"website" text,
	"commission_rate" numeric(5, 4) DEFAULT '0.2000' NOT NULL,
	"payment_method" text,
	"payment_email" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "artists_slug_unique" UNIQUE("slug"),
	CONSTRAINT "artists_status_valid" CHECK ("artists"."status" IN ('active', 'inactive'))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "artists_square_category_id_idx"
  ON "artists" ("square_category_id");
