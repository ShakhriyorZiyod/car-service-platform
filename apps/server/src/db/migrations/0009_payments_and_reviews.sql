CREATE TYPE "public"."fiscal_provider" AS ENUM('manual');--> statement-breakpoint
CREATE TYPE "public"."fiscal_status" AS ENUM('done');--> statement-breakpoint
CREATE TYPE "public"."payment_method" AS ENUM('cash', 'card_terminal', 'transfer');--> statement-breakpoint
CREATE TABLE "reviews" (
	"order_id" uuid PRIMARY KEY NOT NULL,
	"client_id" uuid NOT NULL,
	"rating" smallint NOT NULL,
	"text" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reviews_rating_range" CHECK ("reviews"."rating" between 1 and 5)
);
--> statement-breakpoint
CREATE TABLE "fiscal_receipts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"order_id" uuid NOT NULL,
	"provider" "fiscal_provider" NOT NULL,
	"status" "fiscal_status" NOT NULL,
	"receipt_no" text NOT NULL,
	"fiscal_sign" text,
	"receipt_url" text,
	"amount" bigint NOT NULL,
	"request_id" uuid NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fiscal_receipts_orderId_unique" UNIQUE("order_id"),
	CONSTRAINT "fiscal_receipts_requestId_unique" UNIQUE("request_id")
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"order_id" uuid NOT NULL,
	"method" "payment_method" NOT NULL,
	"amount" bigint NOT NULL,
	"received_by" uuid NOT NULL,
	"received_at" timestamp with time zone NOT NULL,
	CONSTRAINT "payments_amount_positive" CHECK ("payments"."amount" > 0)
);
--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_client_id_users_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fiscal_receipts" ADD CONSTRAINT "fiscal_receipts_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fiscal_receipts" ADD CONSTRAINT "fiscal_receipts_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_received_by_users_id_fk" FOREIGN KEY ("received_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "payments_order_idx" ON "payments" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "payments_received_at_idx" ON "payments" USING btree ("received_at");