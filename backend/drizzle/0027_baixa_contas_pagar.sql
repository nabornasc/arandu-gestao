CREATE TABLE "expense_payments" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "expense_payments_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"company_id" integer NOT NULL,
	"expense_id" integer NOT NULL,
	"bank_account_id" integer,
	"paid_on" date NOT NULL,
	"principal" numeric(12, 2) NOT NULL,
	"interest" numeric(12, 2) DEFAULT 0 NOT NULL,
	"discount" numeric(12, 2) DEFAULT 0 NOT NULL,
	"paid" numeric(12, 2) NOT NULL,
	"method" varchar(40),
	"notes" varchar(255),
	"created_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reversed_at" timestamp with time zone,
	"reversed_by" integer,
	"reversal_reason" varchar(255)
);
--> statement-breakpoint
DROP INDEX "cash_transactions_expense_id_index";--> statement-breakpoint
ALTER TABLE "cash_transactions" ADD COLUMN "expense_payment_id" integer;--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN "paid_amount" numeric(12, 2) DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "expense_payments" ADD CONSTRAINT "expense_payments_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_payments" ADD CONSTRAINT "expense_payments_expense_id_expenses_id_fk" FOREIGN KEY ("expense_id") REFERENCES "public"."expenses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_payments" ADD CONSTRAINT "expense_payments_bank_account_id_bank_accounts_id_fk" FOREIGN KEY ("bank_account_id") REFERENCES "public"."bank_accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_payments" ADD CONSTRAINT "expense_payments_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_payments" ADD CONSTRAINT "expense_payments_reversed_by_users_id_fk" FOREIGN KEY ("reversed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "expense_payments_expense_id_index" ON "expense_payments" USING btree ("expense_id");--> statement-breakpoint
CREATE INDEX "expense_payments_bank_account_id_index" ON "expense_payments" USING btree ("bank_account_id");--> statement-breakpoint
ALTER TABLE "cash_transactions" ADD CONSTRAINT "cash_transactions_expense_payment_id_expense_payments_id_fk" FOREIGN KEY ("expense_payment_id") REFERENCES "public"."expense_payments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "cash_transactions_expense_payment_id_index" ON "cash_transactions" USING btree ("expense_payment_id");--> statement-breakpoint
CREATE INDEX "cash_transactions_expense_id_index" ON "cash_transactions" USING btree ("expense_id");--> statement-breakpoint
-- Despesas já pagas viram uma baixa cada, no valor total e na data da despesa, sem mudar o saldo:
-- a saída de caixa que já existe passa a apontar para a baixa.
INSERT INTO "expense_payments" ("company_id", "expense_id", "bank_account_id", "paid_on", "principal", "paid", "created_at")
SELECT "company_id", "id", "bank_account_id", "expense_date", "amount", "amount", "created_at"
FROM "expenses" WHERE "status" = 'paid';--> statement-breakpoint
UPDATE "expenses" SET "paid_amount" = "amount" WHERE "status" = 'paid';--> statement-breakpoint
UPDATE "cash_transactions" c SET "expense_payment_id" = p."id"
FROM "expense_payments" p WHERE c."expense_id" = p."expense_id";
