ALTER TABLE "users" ADD COLUMN "internal_note" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "deletion_requested_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "anonymized_at" timestamp with time zone;