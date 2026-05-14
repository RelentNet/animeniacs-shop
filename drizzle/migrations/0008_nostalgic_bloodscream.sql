CREATE TABLE IF NOT EXISTS "order_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"square_order_id" text NOT NULL,
	"event_type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
