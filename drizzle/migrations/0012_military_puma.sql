CREATE TABLE IF NOT EXISTS "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"square_order_id" text NOT NULL,
	"square_payment_id" text,
	"user_id" text,
	"buyer_email" text,
	"square_customer_id" text,
	"status" text DEFAULT 'completed' NOT NULL,
	"total_cents" integer NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"line_items" jsonb NOT NULL,
	"placed_at" timestamp with time zone,
	"raw" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "orders_square_order_id_unique" UNIQUE("square_order_id"),
	CONSTRAINT "orders_status_valid" CHECK ("orders"."status" IN ('completed', 'refunded', 'partially_refunded'))
);
--> statement-breakpoint
-- customer_link re-key: the table is empty + unreferenced (confirmed Phase 11),
-- so dropping the old email PK and re-keying to the Logto sub is safe.
-- The inline `email text PRIMARY KEY` (migration 0006) yields the Postgres
-- default constraint name customer_link_pkey.
ALTER TABLE "customer_link" DROP CONSTRAINT IF EXISTS "customer_link_pkey";--> statement-breakpoint
ALTER TABLE "customer_link" ALTER COLUMN "email" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "abandoned_carts" ADD COLUMN "buyer_user_id" text;--> statement-breakpoint
ALTER TABLE "abandoned_carts" ADD COLUMN "square_customer_id" text;--> statement-breakpoint
ALTER TABLE "customer_link" ADD COLUMN "user_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "customer_link" ADD CONSTRAINT "customer_link_pkey" PRIMARY KEY ("user_id");--> statement-breakpoint
ALTER TABLE "customer_link" ADD COLUMN "name" text;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "orders_user_id_idx" ON "orders" USING btree ("user_id");
