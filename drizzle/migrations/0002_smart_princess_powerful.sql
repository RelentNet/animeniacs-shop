CREATE TABLE IF NOT EXISTS "sms_recipients" (
	"id" serial PRIMARY KEY NOT NULL,
	"phone" text NOT NULL,
	"label" text,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sms_recipients_phone_unique" UNIQUE("phone")
);
