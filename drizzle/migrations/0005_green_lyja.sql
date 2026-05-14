CREATE TABLE IF NOT EXISTS "abandoned_carts" (
	"cart_id" text PRIMARY KEY NOT NULL,
	"square_order_id" text,
	"buyer_email" text,
	"cart_snapshot" jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"reminder_sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "abandoned_carts_status_valid" CHECK ("abandoned_carts"."status" IN ('pending', 'in_checkout', 'completed', 'abandoned'))
);
