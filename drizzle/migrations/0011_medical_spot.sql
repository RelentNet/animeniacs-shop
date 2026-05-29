ALTER TABLE "order_log" ADD COLUMN "event_id" text;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "order_log_event_id_idx" ON "order_log" USING btree ("event_id");