CREATE TABLE IF NOT EXISTS "product_cache" (
	"catalog_item_id" text PRIMARY KEY NOT NULL,
	"data" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
