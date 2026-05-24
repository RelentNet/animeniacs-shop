CREATE TABLE IF NOT EXISTS "ip_nicknames" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"square_category_id" text NOT NULL,
	"slug" text NOT NULL,
	"nickname" text NOT NULL,
	"description" text,
	"cover_image_url" text,
	"is_public" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ip_nicknames_square_category_id_unique" UNIQUE("square_category_id"),
	CONSTRAINT "ip_nicknames_slug_unique" UNIQUE("slug")
);
