CREATE TYPE "public"."purchase_status" AS ENUM('draft', 'received', 'cancelled');--> statement-breakpoint
ALTER TYPE "public"."stock_movement_kind" ADD VALUE 'purchase';--> statement-breakpoint
CREATE TABLE "purchase_items" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "purchase_items_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"purchase_id" integer NOT NULL,
	"product_id" integer NOT NULL,
	"quantity" numeric(12, 2) NOT NULL,
	"unit_cost" numeric(12, 2) NOT NULL,
	"subtotal" numeric(12, 2) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchases" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "purchases_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"company_id" integer NOT NULL,
	"number" integer NOT NULL,
	"supplier_id" integer,
	"purchase_date" date NOT NULL,
	"due_date" date NOT NULL,
	"status" "purchase_status" DEFAULT 'draft' NOT NULL,
	"freight" numeric(12, 2) DEFAULT 0 NOT NULL,
	"total" numeric(12, 2) DEFAULT 0 NOT NULL,
	"notes" varchar(500),
	"expense_id" integer,
	"received_at" timestamp with time zone,
	"created_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "purchase_seq" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "purchase_items" ADD CONSTRAINT "purchase_items_purchase_id_purchases_id_fk" FOREIGN KEY ("purchase_id") REFERENCES "public"."purchases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_items" ADD CONSTRAINT "purchase_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_supplier_id_people_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_expense_id_expenses_id_fk" FOREIGN KEY ("expense_id") REFERENCES "public"."expenses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "purchase_items_purchase_id_index" ON "purchase_items" USING btree ("purchase_id");--> statement-breakpoint
CREATE INDEX "purchase_items_product_id_index" ON "purchase_items" USING btree ("product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "purchases_company_id_number_index" ON "purchases" USING btree ("company_id","number");--> statement-breakpoint
CREATE INDEX "purchases_company_id_purchase_date_index" ON "purchases" USING btree ("company_id","purchase_date");