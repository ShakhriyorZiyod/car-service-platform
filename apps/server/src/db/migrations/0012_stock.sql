CREATE TYPE "public"."product_unit" AS ENUM('pcs', 'ml', 'l', 'kg', 'm', 'm2');--> statement-breakpoint
CREATE TYPE "public"."stock_document_kind" AS ENUM('receipt', 'write_off', 'inventory', 'sale');--> statement-breakpoint
CREATE TYPE "public"."stock_document_status" AS ENUM('draft', 'posted');--> statement-breakpoint
CREATE TYPE "public"."write_off_reason" AS ENUM('defect', 'expired', 'internal', 'other');--> statement-breakpoint
ALTER TYPE "public"."media_purpose" ADD VALUE 'product_photo';--> statement-breakpoint
ALTER TYPE "public"."media_purpose" ADD VALUE 'stock_invoice';--> statement-breakpoint
CREATE TABLE "product_categories" (
	"id" uuid PRIMARY KEY NOT NULL,
	"parent_id" uuid,
	"name_uz" text NOT NULL,
	"name_ru" text NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_categories_not_own_parent" CHECK ("product_categories"."parent_id" is distinct from "product_categories"."id")
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY NOT NULL,
	"sku" text NOT NULL,
	"barcode" text,
	"name_uz" text NOT NULL,
	"name_ru" text NOT NULL,
	"description_uz" text,
	"description_ru" text,
	"category_id" uuid NOT NULL,
	"brand" text,
	"unit" "product_unit" NOT NULL,
	"pack" text,
	"is_for_sale" boolean DEFAULT false NOT NULL,
	"is_consumable" boolean DEFAULT false NOT NULL,
	"sell_price" bigint,
	"min_qty" numeric(12, 3) DEFAULT 0 NOT NULL,
	"avg_cost" bigint DEFAULT 0 NOT NULL,
	"last_cost" bigint,
	"sort" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "products_for_sale_priced_in_pieces" CHECK (not "products"."is_for_sale" or ("products"."unit" = 'pcs' and "products"."sell_price" is not null)),
	CONSTRAINT "products_has_a_use" CHECK ("products"."is_for_sale" or "products"."is_consumable"),
	CONSTRAINT "products_sell_price_not_negative" CHECK ("products"."sell_price" is null or "products"."sell_price" >= 0),
	CONSTRAINT "products_costs_not_negative" CHECK ("products"."avg_cost" >= 0 and coalesce("products"."last_cost", 0) >= 0),
	CONSTRAINT "products_min_qty_not_negative" CHECK ("products"."min_qty" >= 0)
);
--> statement-breakpoint
CREATE TABLE "stock_document_lines" (
	"id" uuid PRIMARY KEY NOT NULL,
	"document_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"qty" numeric(12, 3) NOT NULL,
	"unit_cost" bigint,
	"expected_qty" numeric(12, 3),
	CONSTRAINT "stock_document_lines_qty_not_negative" CHECK ("stock_document_lines"."qty" >= 0),
	CONSTRAINT "stock_document_lines_cost_not_negative" CHECK ("stock_document_lines"."unit_cost" is null or "stock_document_lines"."unit_cost" >= 0)
);
--> statement-breakpoint
CREATE TABLE "stock_documents" (
	"id" uuid PRIMARY KEY NOT NULL,
	"number" integer DEFAULT nextval('stock_document_number_seq') NOT NULL,
	"kind" "stock_document_kind" NOT NULL,
	"status" "stock_document_status" DEFAULT 'draft' NOT NULL,
	"supplier_id" uuid,
	"invoice_no" text,
	"invoice_date" date,
	"reason" "write_off_reason",
	"note" text,
	"shop_order_id" uuid,
	"posted_at" timestamp with time zone,
	"posted_by" uuid,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stock_documents_number_unique" UNIQUE("number"),
	CONSTRAINT "stock_documents_write_off_reason" CHECK ("stock_documents"."kind" <> 'write_off' or "stock_documents"."status" = 'draft' or "stock_documents"."reason" is not null),
	CONSTRAINT "stock_documents_posted_fields" CHECK (("stock_documents"."status" = 'posted') = ("stock_documents"."posted_at" is not null and "stock_documents"."posted_by" is not null)),
	CONSTRAINT "stock_documents_supplier_only_on_receipts" CHECK ("stock_documents"."kind" = 'receipt' or ("stock_documents"."supplier_id" is null and "stock_documents"."invoice_no" is null))
);
--> statement-breakpoint
CREATE TABLE "stock_levels" (
	"product_id" uuid PRIMARY KEY NOT NULL,
	"on_hand" numeric(12, 3) DEFAULT 0 NOT NULL,
	"reserved" numeric(12, 3) DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stock_levels_consistent" CHECK ("stock_levels"."on_hand" >= 0 and "stock_levels"."reserved" >= 0 and "stock_levels"."reserved" <= "stock_levels"."on_hand")
);
--> statement-breakpoint
CREATE TABLE "stock_movements" (
	"id" uuid PRIMARY KEY NOT NULL,
	"document_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"delta" numeric(12, 3) NOT NULL,
	"unit_cost" bigint NOT NULL,
	"at" timestamp with time zone NOT NULL,
	"actor_id" uuid,
	CONSTRAINT "stock_movements_delta_not_zero" CHECK ("stock_movements"."delta" <> 0)
);
--> statement-breakpoint
CREATE TABLE "suppliers" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"phone" text,
	"inn" text,
	"note" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "media" DROP CONSTRAINT "media_one_owner";--> statement-breakpoint
ALTER TABLE "media" DROP CONSTRAINT "media_purpose_fits_owner";--> statement-breakpoint
ALTER TABLE "media" ADD COLUMN "product_id" uuid;--> statement-breakpoint
ALTER TABLE "media" ADD COLUMN "stock_document_id" uuid;--> statement-breakpoint
ALTER TABLE "product_categories" ADD CONSTRAINT "product_categories_parent_id_product_categories_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."product_categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_category_id_product_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."product_categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_document_lines" ADD CONSTRAINT "stock_document_lines_document_id_stock_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."stock_documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_document_lines" ADD CONSTRAINT "stock_document_lines_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_documents" ADD CONSTRAINT "stock_documents_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_documents" ADD CONSTRAINT "stock_documents_posted_by_users_id_fk" FOREIGN KEY ("posted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_documents" ADD CONSTRAINT "stock_documents_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_levels" ADD CONSTRAINT "stock_levels_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_document_id_stock_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."stock_documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "product_categories_name_unique" ON "product_categories" USING btree (coalesce("parent_id", '00000000-0000-0000-0000-000000000000'::uuid),lower("name_uz"));--> statement-breakpoint
CREATE UNIQUE INDEX "products_sku_unique" ON "products" USING btree (lower("sku"));--> statement-breakpoint
CREATE UNIQUE INDEX "products_barcode_unique" ON "products" USING btree ("barcode");--> statement-breakpoint
CREATE INDEX "products_category_idx" ON "products" USING btree ("category_id");--> statement-breakpoint
CREATE UNIQUE INDEX "stock_document_lines_product_unique" ON "stock_document_lines" USING btree ("document_id","product_id");--> statement-breakpoint
CREATE INDEX "stock_documents_kind_idx" ON "stock_documents" USING btree ("kind","created_at");--> statement-breakpoint
CREATE INDEX "stock_movements_product_idx" ON "stock_movements" USING btree ("product_id","at");--> statement-breakpoint
CREATE INDEX "stock_movements_at_idx" ON "stock_movements" USING btree ("at");--> statement-breakpoint
CREATE UNIQUE INDEX "suppliers_name_unique" ON "suppliers" USING btree (lower("name"));--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_stock_document_id_stock_documents_id_fk" FOREIGN KEY ("stock_document_id") REFERENCES "public"."stock_documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "media_product_idx" ON "media" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "media_stock_document_idx" ON "media" USING btree ("stock_document_id");--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_one_owner" CHECK (num_nonnulls("media"."reception_act_id", "media"."task_id", "media"."product_id", "media"."stock_document_id") = 1);--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_purpose_fits_owner" CHECK (("media"."purpose" in ('reception_side', 'reception_defect') and "media"."reception_act_id" is not null)
        or ("media"."purpose" in ('task_before', 'task_after') and "media"."task_id" is not null and "media"."attempt" is not null)
        or ("media"."purpose"::text = 'product_photo' and "media"."product_id" is not null)
        or ("media"."purpose"::text = 'stock_invoice' and "media"."stock_document_id" is not null));