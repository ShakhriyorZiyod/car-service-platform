CREATE TYPE "public"."shop_fulfillment" AS ENUM('pickup', 'with_service');--> statement-breakpoint
CREATE TYPE "public"."shop_order_source" AS ENUM('tma', 'counter');--> statement-breakpoint
CREATE TYPE "public"."shop_order_status" AS ENUM('new', 'confirmed', 'ready_for_pickup', 'completed', 'cancelled');--> statement-breakpoint
ALTER TYPE "public"."status_entity" ADD VALUE 'shop_order';--> statement-breakpoint
CREATE TABLE "shop_order_calls" (
	"id" uuid PRIMARY KEY NOT NULL,
	"shop_order_id" uuid NOT NULL,
	"admin_id" uuid NOT NULL,
	"outcome" "call_outcome" NOT NULL,
	"note" text,
	"at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shop_order_items" (
	"id" uuid PRIMARY KEY NOT NULL,
	"shop_order_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"name_uz" text NOT NULL,
	"name_ru" text NOT NULL,
	"pack" text,
	"price" bigint NOT NULL,
	"qty" integer NOT NULL,
	"line_total" bigint NOT NULL,
	CONSTRAINT "shop_order_items_qty_positive" CHECK ("shop_order_items"."qty" > 0),
	CONSTRAINT "shop_order_items_line_total" CHECK ("shop_order_items"."line_total" = "shop_order_items"."price" * "shop_order_items"."qty")
);
--> statement-breakpoint
CREATE TABLE "shop_orders" (
	"id" uuid PRIMARY KEY NOT NULL,
	"number" integer DEFAULT nextval('order_number_seq') NOT NULL,
	"status" "shop_order_status" NOT NULL,
	"source" "shop_order_source" NOT NULL,
	"client_id" uuid,
	"fulfillment" "shop_fulfillment" DEFAULT 'pickup' NOT NULL,
	"service_order_id" uuid,
	"subtotal" bigint NOT NULL,
	"discount_amount" bigint DEFAULT 0 NOT NULL,
	"discount_percent" numeric(5, 2),
	"discount_reason" text,
	"discount_by" uuid,
	"total" bigint NOT NULL,
	"client_comment" text,
	"hold_until" timestamp with time zone,
	"pickup_until" timestamp with time zone,
	"confirmed_at" timestamp with time zone,
	"confirmed_by" uuid,
	"ready_at" timestamp with time zone,
	"ready_by" uuid,
	"completed_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"cancelled_by" uuid,
	"cancel_reason_id" uuid,
	"cancel_note" text,
	"client_request_id" uuid,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shop_orders_number_unique" UNIQUE("number"),
	CONSTRAINT "shop_orders_total" CHECK ("shop_orders"."total" = "shop_orders"."subtotal" - "shop_orders"."discount_amount"),
	CONSTRAINT "shop_orders_discount_range" CHECK ("shop_orders"."discount_amount" >= 0 and "shop_orders"."discount_amount" <= "shop_orders"."subtotal"),
	CONSTRAINT "shop_orders_tma_has_client" CHECK ("shop_orders"."source" <> 'tma' or "shop_orders"."client_id" is not null),
	CONSTRAINT "shop_orders_with_service_has_order" CHECK (("shop_orders"."fulfillment" = 'with_service') = ("shop_orders"."service_order_id" is not null))
);
--> statement-breakpoint
ALTER TABLE "fiscal_receipts" DROP CONSTRAINT "fiscal_receipts_orderId_unique";--> statement-breakpoint
ALTER TABLE "fiscal_receipts" ALTER COLUMN "order_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "payments" ALTER COLUMN "order_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "fiscal_receipts" ADD COLUMN "shop_order_id" uuid;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "shop_order_id" uuid;--> statement-breakpoint
ALTER TABLE "shop_order_calls" ADD CONSTRAINT "shop_order_calls_shop_order_id_shop_orders_id_fk" FOREIGN KEY ("shop_order_id") REFERENCES "public"."shop_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_order_calls" ADD CONSTRAINT "shop_order_calls_admin_id_users_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_order_items" ADD CONSTRAINT "shop_order_items_shop_order_id_shop_orders_id_fk" FOREIGN KEY ("shop_order_id") REFERENCES "public"."shop_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_order_items" ADD CONSTRAINT "shop_order_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_orders" ADD CONSTRAINT "shop_orders_client_id_users_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_orders" ADD CONSTRAINT "shop_orders_service_order_id_orders_id_fk" FOREIGN KEY ("service_order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_orders" ADD CONSTRAINT "shop_orders_discount_by_users_id_fk" FOREIGN KEY ("discount_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_orders" ADD CONSTRAINT "shop_orders_confirmed_by_users_id_fk" FOREIGN KEY ("confirmed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_orders" ADD CONSTRAINT "shop_orders_ready_by_users_id_fk" FOREIGN KEY ("ready_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_orders" ADD CONSTRAINT "shop_orders_cancelled_by_users_id_fk" FOREIGN KEY ("cancelled_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_orders" ADD CONSTRAINT "shop_orders_cancel_reason_id_cancel_reasons_id_fk" FOREIGN KEY ("cancel_reason_id") REFERENCES "public"."cancel_reasons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_orders" ADD CONSTRAINT "shop_orders_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "shop_order_calls_order_idx" ON "shop_order_calls" USING btree ("shop_order_id","at");--> statement-breakpoint
CREATE UNIQUE INDEX "shop_order_items_product_unique" ON "shop_order_items" USING btree ("shop_order_id","product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "shop_orders_client_request_unique" ON "shop_orders" USING btree ("client_id","client_request_id") WHERE "shop_orders"."client_request_id" is not null;--> statement-breakpoint
CREATE INDEX "shop_orders_status_idx" ON "shop_orders" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "shop_orders_client_idx" ON "shop_orders" USING btree ("client_id","created_at");--> statement-breakpoint
ALTER TABLE "fiscal_receipts" ADD CONSTRAINT "fiscal_receipts_shop_order_id_shop_orders_id_fk" FOREIGN KEY ("shop_order_id") REFERENCES "public"."shop_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_shop_order_id_shop_orders_id_fk" FOREIGN KEY ("shop_order_id") REFERENCES "public"."shop_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "payments_shop_order_idx" ON "payments" USING btree ("shop_order_id");--> statement-breakpoint
ALTER TABLE "fiscal_receipts" ADD CONSTRAINT "fiscal_receipts_order_id_unique" UNIQUE("order_id");--> statement-breakpoint
ALTER TABLE "fiscal_receipts" ADD CONSTRAINT "fiscal_receipts_shop_order_id_unique" UNIQUE("shop_order_id");--> statement-breakpoint
ALTER TABLE "fiscal_receipts" ADD CONSTRAINT "fiscal_receipts_one_target" CHECK (num_nonnulls("fiscal_receipts"."order_id", "fiscal_receipts"."shop_order_id") = 1);--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_one_target" CHECK (num_nonnulls("payments"."order_id", "payments"."shop_order_id") = 1);