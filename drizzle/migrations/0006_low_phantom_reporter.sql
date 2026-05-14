CREATE TABLE IF NOT EXISTS "customer_link" (
	"email" text PRIMARY KEY NOT NULL,
	"square_customer_id" text NOT NULL,
	"cached_at" timestamp with time zone DEFAULT now() NOT NULL
);
