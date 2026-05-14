CREATE TABLE IF NOT EXISTS "wishlists" (
	"user_id" text NOT NULL,
	"product_id" text NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wishlists_user_id_product_id_pk" PRIMARY KEY("user_id","product_id")
);
