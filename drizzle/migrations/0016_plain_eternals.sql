-- Phase 15 (spec §4.4): DISPOSABLE SANDBOX DATA RECONCILIATION.
--
-- Existing user-keyed rows hold old Logto `sub` strings that cannot FK to the
-- new better-auth `user.id`s (there are no real users — this is sandbox test
-- data). Before adding the FK constraints we therefore NULL the nullable FKs
-- and DELETE the wishlist rows (whose user_id is part of the PK and cannot be
-- nulled). New rows get proper FKs going forward. This is intentional, one-time,
-- and safe precisely because no production users exist yet.
UPDATE "orders" SET "user_id" = NULL;--> statement-breakpoint
UPDATE "reviews" SET "user_id" = NULL;--> statement-breakpoint
UPDATE "abandoned_carts" SET "buyer_user_id" = NULL;--> statement-breakpoint
DELETE FROM "wishlists";--> statement-breakpoint

-- squareCustomerId now lives on the user row; the customer_link table is gone.
ALTER TABLE "customer_link" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "customer_link" CASCADE;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "abandoned_carts" ADD CONSTRAINT "abandoned_carts_buyer_user_id_user_id_fk" FOREIGN KEY ("buyer_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "orders" ADD CONSTRAINT "orders_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "reviews" ADD CONSTRAINT "reviews_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "wishlists" ADD CONSTRAINT "wishlists_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
