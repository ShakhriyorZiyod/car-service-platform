CREATE TYPE "public"."body_class" AS ENUM('S', 'M', 'L', 'XL');--> statement-breakpoint
CREATE TYPE "public"."cancel_reason_audience" AS ENUM('client', 'staff', 'system');--> statement-breakpoint
CREATE TYPE "public"."service_group" AS ENUM('body', 'glass', 'interior', 'other');--> statement-breakpoint
CREATE TABLE "cancel_reasons" (
	"id" uuid PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name_uz" text NOT NULL,
	"name_ru" text NOT NULL,
	"applies_to" "cancel_reason_audience" NOT NULL,
	"requires_text" boolean DEFAULT false NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "cancel_reasons_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "car_brands" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "car_models" (
	"id" uuid PRIMARY KEY NOT NULL,
	"brand_id" uuid NOT NULL,
	"name" text NOT NULL,
	"body_class" "body_class" NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "service_excludes" (
	"service_id" uuid NOT NULL,
	"excluded_service_id" uuid NOT NULL,
	CONSTRAINT "service_excludes_service_id_excluded_service_id_pk" PRIMARY KEY("service_id","excluded_service_id"),
	CONSTRAINT "service_excludes_not_itself" CHECK ("service_excludes"."service_id" <> "service_excludes"."excluded_service_id")
);
--> statement-breakpoint
CREATE TABLE "service_prices" (
	"service_id" uuid NOT NULL,
	"body_class" "body_class" NOT NULL,
	"price" bigint,
	"duration_min" integer NOT NULL,
	CONSTRAINT "service_prices_service_id_body_class_pk" PRIMARY KEY("service_id","body_class"),
	CONSTRAINT "service_prices_price_not_negative" CHECK ("service_prices"."price" is null or "service_prices"."price" >= 0),
	CONSTRAINT "service_prices_duration_positive" CHECK ("service_prices"."duration_min" > 0)
);
--> statement-breakpoint
CREATE TABLE "service_types" (
	"id" uuid PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name_uz" text NOT NULL,
	"name_ru" text NOT NULL,
	"icon" text NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "service_types_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "services" (
	"id" uuid PRIMARY KEY NOT NULL,
	"service_type_id" uuid NOT NULL,
	"name_uz" text NOT NULL,
	"name_ru" text NOT NULL,
	"group" "service_group" NOT NULL,
	"is_custom" boolean DEFAULT false NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "box_service_types" (
	"box_id" uuid NOT NULL,
	"service_type_id" uuid NOT NULL,
	CONSTRAINT "box_service_types_box_id_service_type_id_pk" PRIMARY KEY("box_id","service_type_id")
);
--> statement-breakpoint
CREATE TABLE "boxes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "holidays" (
	"date" date PRIMARY KEY NOT NULL,
	"name" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"data" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	CONSTRAINT "settings_single_row" CHECK ("settings"."id" = 1)
);
--> statement-breakpoint
CREATE TABLE "work_hours" (
	"weekday" smallint PRIMARY KEY NOT NULL,
	"open" time(0) NOT NULL,
	"close" time(0) NOT NULL,
	"break_start" time(0),
	"break_end" time(0),
	CONSTRAINT "work_hours_weekday_range" CHECK ("work_hours"."weekday" between 1 and 7),
	CONSTRAINT "work_hours_close_after_open" CHECK ("work_hours"."close" > "work_hours"."open"),
	CONSTRAINT "work_hours_break_complete" CHECK (("work_hours"."break_start" is null) = ("work_hours"."break_end" is null)),
	CONSTRAINT "work_hours_break_inside" CHECK ("work_hours"."break_start" is null or ("work_hours"."break_start" >= "work_hours"."open" and "work_hours"."break_end" <= "work_hours"."close" and "work_hours"."break_end" > "work_hours"."break_start"))
);
--> statement-breakpoint
ALTER TABLE "car_models" ADD CONSTRAINT "car_models_brand_id_car_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."car_brands"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_excludes" ADD CONSTRAINT "service_excludes_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_excludes" ADD CONSTRAINT "service_excludes_excluded_service_id_services_id_fk" FOREIGN KEY ("excluded_service_id") REFERENCES "public"."services"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_prices" ADD CONSTRAINT "service_prices_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "services" ADD CONSTRAINT "services_service_type_id_service_types_id_fk" FOREIGN KEY ("service_type_id") REFERENCES "public"."service_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "box_service_types" ADD CONSTRAINT "box_service_types_box_id_boxes_id_fk" FOREIGN KEY ("box_id") REFERENCES "public"."boxes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "box_service_types" ADD CONSTRAINT "box_service_types_service_type_id_service_types_id_fk" FOREIGN KEY ("service_type_id") REFERENCES "public"."service_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settings" ADD CONSTRAINT "settings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "car_brands_name_unique" ON "car_brands" USING btree (lower("name"));--> statement-breakpoint
CREATE UNIQUE INDEX "car_models_brand_name_unique" ON "car_models" USING btree ("brand_id",lower("name"));