CREATE TABLE IF NOT EXISTS "reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" text NOT NULL,
	"user_id" text,
	"order_id" text,
	"rating" integer NOT NULL,
	"title" text,
	"body" text NOT NULL,
	"photo_urls" text[] DEFAULT '{}'::text[] NOT NULL,
	"is_published" boolean DEFAULT false NOT NULL,
	"is_verified_purchase" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reviews_user_product_unique" UNIQUE("user_id","product_id"),
	CONSTRAINT "reviews_rating_range" CHECK ("reviews"."rating" BETWEEN 1 AND 5)
);
