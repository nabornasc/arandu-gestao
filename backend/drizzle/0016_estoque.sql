CREATE TYPE "public"."stock_movement_kind" AS ENUM('initial', 'adjustment', 'count', 'sale', 'return', 'edit');--> statement-breakpoint
CREATE TABLE "stock_movements" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "stock_movements_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"company_id" integer NOT NULL,
	"product_id" integer NOT NULL,
	"kind" "stock_movement_kind" NOT NULL,
	"quantity" numeric(12, 2) NOT NULL,
	"balance" numeric(12, 2) NOT NULL,
	"reason" varchar(255),
	"order_id" integer,
	"user_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "unit" varchar(4) DEFAULT 'UN' NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "min_stock" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "stock_movements_company_id_product_id_created_at_index" ON "stock_movements" USING btree ("company_id","product_id","created_at");--> statement-breakpoint
-- Quem já edita produtos passa a poder ajustar o estoque (o Proprietário tem tudo por definição).
INSERT INTO "access_group_permissions" ("group_id", "permission")
SELECT "group_id", 'products.adjust' FROM "access_group_permissions" WHERE "permission" = 'products.update'
ON CONFLICT DO NOTHING;--> statement-breakpoint
-- O extrato começa com o saldo atual de cada produto que controla estoque.
INSERT INTO "stock_movements" ("company_id", "product_id", "kind", "quantity", "balance", "reason")
SELECT "company_id", "id", 'initial', "stock", "stock", 'Saldo na criação do extrato'
FROM "products" WHERE "type" = 'product' AND "stock" IS NOT NULL;
