CREATE TABLE "payment_conditions" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "payment_conditions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"company_id" integer NOT NULL,
	"name" varchar(80) NOT NULL,
	"down_payment_percent" numeric(12, 2) DEFAULT 0 NOT NULL,
	"down_payment_method" varchar(40),
	"days" integer[] DEFAULT '{}'::integer[] NOT NULL,
	"method" varchar(40),
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "payment_conditions" ADD CONSTRAINT "payment_conditions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "payment_conditions_name_unique" ON "payment_conditions" USING btree ("company_id",lower("name"));--> statement-breakpoint
-- Condições com que cada empresa começa (as mesmas criadas no cadastro de empresa nova).
INSERT INTO "payment_conditions" ("company_id", "name", "down_payment_percent", "down_payment_method", "days", "method")
SELECT c."id", d."name", d."down", d."down_method", d."days", d."method"
FROM "companies" c
CROSS JOIN (VALUES
  ('À vista', 100, 'PIX', '{}'::integer[], NULL),
  ('30 dias', 0, NULL, '{30}'::integer[], 'Boleto'),
  ('30/60 dias', 0, NULL, '{30,60}'::integer[], 'Boleto'),
  ('30/60/90 dias', 0, NULL, '{30,60,90}'::integer[], 'Boleto'),
  ('Entrada 50% + 30 dias', 50, 'PIX', '{30}'::integer[], 'Boleto')
) AS d("name", "down", "down_method", "days", "method");
