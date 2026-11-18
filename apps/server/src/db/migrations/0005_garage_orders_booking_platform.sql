CREATE TYPE "public"."booking_kind" AS ENUM('order', 'block');--> statement-breakpoint
CREATE TYPE "public"."approval_channel" AS ENUM('tma', 'bot', 'phone');--> statement-breakpoint
CREATE TYPE "public"."call_outcome" AS ENUM('confirmed', 'no_answer', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."item_approval" AS ENUM('not_required', 'pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."order_item_kind" AS ENUM('booked', 'extra');--> statement-breakpoint
CREATE TYPE "public"."order_source" AS ENUM('tma', 'phone', 'walk_in', 'instagram', 'other');--> statement-breakpoint
CREATE TYPE "public"."order_status" AS ENUM('new', 'confirmed', 'in_work', 'ready_for_pickup', 'completed', 'cancelled', 'no_show');--> statement-breakpoint
CREATE TYPE "public"."outbox_status" AS ENUM('pending', 'sent', 'skipped', 'dead');--> statement-breakpoint
CREATE TYPE "public"."status_entity" AS ENUM('order', 'task');--> statement-breakpoint
CREATE TABLE "bookings" (
	"id" uuid PRIMARY KEY NOT NULL,
	"kind" "booking_kind" NOT NULL,
	"order_id" uuid,
	"box_id" uuid NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"released_at" timestamp with time zone,
	"release_reason" text,
	"note" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bookings_ends_after_start" CHECK ("bookings"."ends_at" > "bookings"."starts_at"),
	CONSTRAINT "bookings_order_iff_kind_order" CHECK (("bookings"."kind" = 'order') = ("bookings"."order_id" is not null))
);
--> statement-breakpoint
CREATE TABLE "cars" (
	"id" uuid PRIMARY KEY NOT NULL,
	"client_id" uuid NOT NULL,
	"model_id" uuid,
	"custom_model_text" text,
	"body_class" "body_class" NOT NULL,
	"year" integer NOT NULL,
	"plate" text NOT NULL,
	"color" text,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cars_has_model" CHECK ("cars"."model_id" is not null or "cars"."custom_model_text" is not null),
	CONSTRAINT "cars_year_range" CHECK ("cars"."year" between 1950 and 2100)
);
--> statement-breakpoint
CREATE TABLE "order_calls" (
	"id" uuid PRIMARY KEY NOT NULL,
	"order_id" uuid NOT NULL,
	"admin_id" uuid NOT NULL,
	"outcome" "call_outcome" NOT NULL,
	"note" text,
	"at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_items" (
	"id" uuid PRIMARY KEY NOT NULL,
	"order_id" uuid NOT NULL,
	"service_id" uuid NOT NULL,
	"service_type_id" uuid NOT NULL,
	"name_uz" text NOT NULL,
	"name_ru" text NOT NULL,
	"type_name_uz" text NOT NULL,
	"type_name_ru" text NOT NULL,
	"body_class" "body_class" NOT NULL,
	"price" bigint,
	"duration_min" integer NOT NULL,
	"comment" text,
	"kind" "order_item_kind" DEFAULT 'booked' NOT NULL,
	"approval" "item_approval" DEFAULT 'not_required' NOT NULL,
	"approval_via" "approval_channel",
	"approval_at" timestamp with time zone,
	"task_id" uuid,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "order_items_price_not_negative" CHECK ("order_items"."price" is null or "order_items"."price" >= 0),
	CONSTRAINT "order_items_duration_positive" CHECK ("order_items"."duration_min" > 0)
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY NOT NULL,
	"number" integer DEFAULT nextval('order_number_seq') NOT NULL,
	"status" "order_status" NOT NULL,
	"source" "order_source" NOT NULL,
	"client_id" uuid NOT NULL,
	"car_id" uuid NOT NULL,
	"car_snapshot" jsonb NOT NULL,
	"body_class" "body_class" NOT NULL,
	"client_comment" text,
	"subtotal" bigint NOT NULL,
	"discount_amount" bigint DEFAULT 0 NOT NULL,
	"discount_percent" numeric(5, 2),
	"discount_reason" text,
	"discount_by" uuid,
	"total" bigint NOT NULL,
	"hold_until" timestamp with time zone,
	"reschedule_requested_at" timestamp with time zone,
	"confirmed_at" timestamp with time zone,
	"confirmed_by" uuid,
	"work_started_at" timestamp with time zone,
	"ready_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"cancelled_by" uuid,
	"cancel_reason_id" uuid,
	"cancel_note" text,
	"client_request_id" uuid,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "orders_number_unique" UNIQUE("number"),
	CONSTRAINT "orders_client_request_unique" UNIQUE("client_id","client_request_id"),
	CONSTRAINT "orders_total_is_subtotal_less_discount" CHECK ("orders"."total" = "orders"."subtotal" - "orders"."discount_amount"),
	CONSTRAINT "orders_discount_range" CHECK ("orders"."discount_amount" >= 0 and "orders"."discount_amount" <= "orders"."subtotal"),
	CONSTRAINT "orders_hold_only_when_new" CHECK ("orders"."hold_until" is null or "orders"."status" = 'new')
);
--> statement-breakpoint
CREATE TABLE "outbox" (
	"id" uuid PRIMARY KEY NOT NULL,
	"recipient_id" uuid NOT NULL,
	"payload" jsonb NOT NULL,
	"dedupe_key" text,
	"status" "outbox_status" DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone NOT NULL,
	"last_error" text,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "status_history" (
	"id" uuid PRIMARY KEY NOT NULL,
	"entity" "status_entity" NOT NULL,
	"entity_id" uuid NOT NULL,
	"from_status" text,
	"to_status" text NOT NULL,
	"actor_id" uuid,
	"reason_id" uuid,
	"comment" text,
	"at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "reminders_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_box_id_boxes_id_fk" FOREIGN KEY ("box_id") REFERENCES "public"."boxes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cars" ADD CONSTRAINT "cars_client_id_users_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cars" ADD CONSTRAINT "cars_model_id_car_models_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."car_models"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_calls" ADD CONSTRAINT "order_calls_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_calls" ADD CONSTRAINT "order_calls_admin_id_users_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_service_type_id_service_types_id_fk" FOREIGN KEY ("service_type_id") REFERENCES "public"."service_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_client_id_users_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_car_id_cars_id_fk" FOREIGN KEY ("car_id") REFERENCES "public"."cars"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_discount_by_users_id_fk" FOREIGN KEY ("discount_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_confirmed_by_users_id_fk" FOREIGN KEY ("confirmed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_cancelled_by_users_id_fk" FOREIGN KEY ("cancelled_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_cancel_reason_id_cancel_reasons_id_fk" FOREIGN KEY ("cancel_reason_id") REFERENCES "public"."cancel_reasons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outbox" ADD CONSTRAINT "outbox_recipient_id_users_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "status_history" ADD CONSTRAINT "status_history_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "bookings_one_active_per_order" ON "bookings" USING btree ("order_id") WHERE "bookings"."released_at" is null and "bookings"."kind" = 'order';--> statement-breakpoint
CREATE INDEX "bookings_box_time_idx" ON "bookings" USING btree ("box_id","starts_at");--> statement-breakpoint
CREATE UNIQUE INDEX "cars_client_plate_unique" ON "cars" USING btree ("client_id","plate") WHERE "cars"."archived_at" is null;--> statement-breakpoint
CREATE INDEX "order_calls_order_idx" ON "order_calls" USING btree ("order_id","at");--> statement-breakpoint
CREATE INDEX "order_items_order_idx" ON "order_items" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "orders_client_idx" ON "orders" USING btree ("client_id","created_at");--> statement-breakpoint
CREATE INDEX "orders_status_idx" ON "orders" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "outbox_dedupe_key_unique" ON "outbox" USING btree ("dedupe_key") WHERE "outbox"."dedupe_key" is not null;--> statement-breakpoint
CREATE INDEX "outbox_due_idx" ON "outbox" USING btree ("next_attempt_at") WHERE "outbox"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "status_history_entity_idx" ON "status_history" USING btree ("entity","entity_id","at");