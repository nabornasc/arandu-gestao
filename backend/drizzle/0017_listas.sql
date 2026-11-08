CREATE TYPE "public"."list_kind" AS ENUM('payment_method', 'payment_terms', 'opportunity_source', 'lost_reason', 'customer_category', 'contact_role', 'financial_category', 'product_group');--> statement-breakpoint
CREATE TABLE "company_list_items" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "company_list_items_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"company_id" integer NOT NULL,
	"kind" "list_kind" NOT NULL,
	"name" varchar(80) NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "group_name" varchar(80);--> statement-breakpoint
ALTER TABLE "company_list_items" ADD CONSTRAINT "company_list_items_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "company_list_items_name_unique" ON "company_list_items" USING btree ("company_id","kind",lower("name"));--> statement-breakpoint
-- Cada empresa começa com os valores que antes ficavam fixos no código (os mesmos de DEFAULT_LISTS)...
INSERT INTO "company_list_items" ("company_id", "kind", "name")
SELECT c."id", v."kind"::"list_kind", v."name"
FROM "companies" c
CROSS JOIN (VALUES
  ('payment_method', 'PIX'), ('payment_method', 'Boleto'), ('payment_method', 'Cartão de crédito'),
  ('payment_method', 'Cartão de débito'), ('payment_method', 'Dinheiro'), ('payment_method', 'Transferência'),
  ('payment_terms', 'À vista'), ('payment_terms', '30 dias'), ('payment_terms', '30/60 dias'),
  ('payment_terms', 'Entrada + 30 dias'), ('payment_terms', 'Entrada 50% + contra-entrega'),
  ('opportunity_source', 'Indicação'), ('opportunity_source', 'Instagram'), ('opportunity_source', 'WhatsApp'),
  ('opportunity_source', 'Site'), ('opportunity_source', 'Feira'), ('opportunity_source', 'Loja física'),
  ('opportunity_source', 'Outro'),
  ('lost_reason', 'Preço'), ('lost_reason', 'Prazo de entrega'), ('lost_reason', 'Escolheu concorrente'),
  ('lost_reason', 'Sem retorno'), ('lost_reason', 'Desistiu da compra'),
  ('customer_category', 'Varejo'), ('customer_category', 'Atacado'),
  ('contact_role', 'Proprietário'), ('contact_role', 'Comprador'), ('contact_role', 'Financeiro'),
  ('financial_category', 'Mercadorias'), ('financial_category', 'Aluguel'), ('financial_category', 'Operacional'),
  ('financial_category', 'Impostos'), ('financial_category', 'Vendas')
) AS v("kind", "name")
ON CONFLICT DO NOTHING;--> statement-breakpoint
-- ...mais os textos que a empresa já usou, para as sugestões não perderem nada do que existe.
INSERT INTO "company_list_items" ("company_id", "kind", "name")
SELECT DISTINCT ON (u."company_id", u."kind", lower(u."name")) u."company_id", u."kind"::"list_kind", u."name"
FROM (
  SELECT "company_id", 'payment_method' AS "kind", trim("payment_method") AS "name" FROM "people"
  UNION ALL SELECT "company_id", 'payment_terms', trim("payment_terms") FROM "people"
  UNION ALL SELECT "company_id", 'customer_category', trim("category") FROM "people"
  UNION ALL SELECT p."company_id", 'contact_role', trim(c."role") FROM "person_contacts" c JOIN "people" p ON p."id" = c."person_id"
  UNION ALL SELECT "company_id", 'opportunity_source', trim("source") FROM "opportunities"
  UNION ALL SELECT "company_id", 'lost_reason', trim("lost_reason") FROM "opportunities"
  UNION ALL SELECT "company_id", 'financial_category', trim("category") FROM "expenses"
  UNION ALL SELECT "company_id", 'financial_category', trim("category") FROM "cash_transactions"
) u
WHERE u."name" IS NOT NULL AND u."name" <> '' AND length(u."name") <= 80
ON CONFLICT DO NOTHING;
