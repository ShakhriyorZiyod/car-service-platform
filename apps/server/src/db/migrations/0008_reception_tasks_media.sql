CREATE TYPE "public"."media_purpose" AS ENUM('reception_side', 'reception_defect', 'task_before', 'task_after');--> statement-breakpoint
CREATE TYPE "public"."photo_side" AS ENUM('front', 'back', 'left', 'right');--> statement-breakpoint
CREATE TYPE "public"."act_confirm_channel" AS ENUM('bot', 'tma', 'verbal');--> statement-breakpoint
CREATE TYPE "public"."act_status" AS ENUM('draft', 'sent', 'confirmed');--> statement-breakpoint
CREATE TYPE "public"."defect_kind" AS ENUM('scratch', 'chip', 'dent', 'crack', 'other');--> statement-breakpoint
CREATE TYPE "public"."defect_view" AS ENUM('top', 'left', 'right', 'front', 'back', 'interior');--> statement-breakpoint
CREATE TYPE "public"."task_decision" AS ENUM('accepted', 'rework');--> statement-breakpoint
CREATE TYPE "public"."task_status" AS ENUM('assigned', 'in_progress', 'on_review', 'rework', 'accepted');--> statement-breakpoint
CREATE TABLE "media" (
	"id" uuid PRIMARY KEY NOT NULL,
	"purpose" "media_purpose" NOT NULL,
	"side" "photo_side",
	"reception_act_id" uuid,
	"task_id" uuid,
	"attempt" integer,
	"storage_key" text NOT NULL,
	"mime" text NOT NULL,
	"bytes" integer NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"uploaded_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "media_storageKey_unique" UNIQUE("storage_key"),
	CONSTRAINT "media_one_owner" CHECK (num_nonnulls("media"."reception_act_id", "media"."task_id") = 1),
	CONSTRAINT "media_purpose_fits_owner" CHECK (("media"."purpose" in ('reception_side', 'reception_defect') and "media"."reception_act_id" is not null)
        or ("media"."purpose" in ('task_before', 'task_after') and "media"."task_id" is not null and "media"."attempt" is not null)),
	CONSTRAINT "media_side_only_for_sides" CHECK (("media"."purpose" = 'reception_side') = ("media"."side" is not null)),
	CONSTRAINT "media_size_positive" CHECK ("media"."bytes" > 0 and "media"."width" > 0 and "media"."height" > 0)
);
--> statement-breakpoint
CREATE TABLE "reception_acts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"order_id" uuid NOT NULL,
	"status" "act_status" DEFAULT 'draft' NOT NULL,
	"mileage_km" integer,
	"fuel_level" integer,
	"checklist" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"personal_items" text,
	"sent_at" timestamp with time zone,
	"confirmed_at" timestamp with time zone,
	"confirmed_via" "act_confirm_channel",
	"confirmed_by" uuid,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reception_acts_orderId_unique" UNIQUE("order_id"),
	CONSTRAINT "reception_acts_fuel_range" CHECK ("reception_acts"."fuel_level" is null or "reception_acts"."fuel_level" between 0 and 4),
	CONSTRAINT "reception_acts_mileage_range" CHECK ("reception_acts"."mileage_km" is null or "reception_acts"."mileage_km" >= 0),
	CONSTRAINT "reception_acts_sent_is_complete" CHECK ("reception_acts"."status" = 'draft' or ("reception_acts"."mileage_km" is not null and "reception_acts"."fuel_level" is not null and "reception_acts"."sent_at" is not null)),
	CONSTRAINT "reception_acts_confirmed_is_signed" CHECK ("reception_acts"."status" <> 'confirmed' or ("reception_acts"."confirmed_at" is not null and "reception_acts"."confirmed_via" is not null)),
	CONSTRAINT "reception_acts_verbal_has_witness" CHECK ("reception_acts"."confirmed_via" is distinct from 'verbal' or "reception_acts"."confirmed_by" is not null)
);
--> statement-breakpoint
CREATE TABLE "reception_defects" (
	"id" uuid PRIMARY KEY NOT NULL,
	"act_id" uuid NOT NULL,
	"view" "defect_view" NOT NULL,
	"x" numeric(5, 4) NOT NULL,
	"y" numeric(5, 4) NOT NULL,
	"kind" "defect_kind" NOT NULL,
	"note" text,
	"media_id" uuid,
	"sort" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "reception_defects_x_range" CHECK ("reception_defects"."x" between 0 and 1),
	CONSTRAINT "reception_defects_y_range" CHECK ("reception_defects"."y" between 0 and 1)
);
--> statement-breakpoint
CREATE TABLE "task_reports" (
	"id" uuid PRIMARY KEY NOT NULL,
	"task_id" uuid NOT NULL,
	"attempt" integer NOT NULL,
	"comment" text DEFAULT '' NOT NULL,
	"submitted_at" timestamp with time zone NOT NULL,
	"decision" "task_decision",
	"remark" text,
	"decided_by" uuid,
	"decided_at" timestamp with time zone,
	CONSTRAINT "task_reports_attempt_unique" UNIQUE("task_id","attempt")
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" uuid PRIMARY KEY NOT NULL,
	"order_id" uuid NOT NULL,
	"master_id" uuid NOT NULL,
	"assistant_id" uuid,
	"status" "task_status" DEFAULT 'assigned' NOT NULL,
	"instruction" text DEFAULT '' NOT NULL,
	"norm_minutes" integer NOT NULL,
	"started_at" timestamp with time zone,
	"submitted_at" timestamp with time zone,
	"accepted_at" timestamp with time zone,
	"rework_count" integer DEFAULT 0 NOT NULL,
	"last_remark" text,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tasks_rework_count_not_negative" CHECK ("tasks"."rework_count" >= 0),
	CONSTRAINT "tasks_norm_positive" CHECK ("tasks"."norm_minutes" > 0)
);
--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_reception_act_id_reception_acts_id_fk" FOREIGN KEY ("reception_act_id") REFERENCES "public"."reception_acts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reception_acts" ADD CONSTRAINT "reception_acts_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reception_acts" ADD CONSTRAINT "reception_acts_confirmed_by_users_id_fk" FOREIGN KEY ("confirmed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reception_acts" ADD CONSTRAINT "reception_acts_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reception_defects" ADD CONSTRAINT "reception_defects_act_id_reception_acts_id_fk" FOREIGN KEY ("act_id") REFERENCES "public"."reception_acts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reception_defects" ADD CONSTRAINT "reception_defects_media_id_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_reports" ADD CONSTRAINT "task_reports_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_reports" ADD CONSTRAINT "task_reports_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_master_id_users_id_fk" FOREIGN KEY ("master_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_assistant_id_users_id_fk" FOREIGN KEY ("assistant_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "media_one_photo_per_side" ON "media" USING btree ("reception_act_id","side") WHERE "media"."purpose" = 'reception_side';--> statement-breakpoint
CREATE INDEX "media_task_idx" ON "media" USING btree ("task_id","attempt");--> statement-breakpoint
CREATE INDEX "media_act_idx" ON "media" USING btree ("reception_act_id");--> statement-breakpoint
CREATE INDEX "reception_defects_act_idx" ON "reception_defects" USING btree ("act_id","sort");--> statement-breakpoint
CREATE INDEX "tasks_master_status_idx" ON "tasks" USING btree ("master_id","status");--> statement-breakpoint
CREATE INDEX "tasks_order_idx" ON "tasks" USING btree ("order_id");--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE no action ON UPDATE no action;