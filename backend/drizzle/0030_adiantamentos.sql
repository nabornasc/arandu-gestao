CREATE TYPE "public"."advance_kind" AS ENUM('advance', 'use');--> statement-breakpoint
CREATE TABLE "customer_advances" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "customer_advances_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"company_id" integer NOT NULL,
	"customer_id" integer NOT NULL,
	"kind" "advance_kind" NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"date" date NOT NULL,
	"bank_account_id" integer,
	"payment_id" integer,
	"notes" varchar(255),
	"created_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reversed_at" timestamp with time zone,
	"reversed_by" integer,
	"reversal_reason" varchar(255)
);
--> statement-breakpoint
ALTER TABLE "cash_transactions" ADD COLUMN "advance_id" integer;--> statement-breakpoint
ALTER TABLE "receivable_payments" ADD COLUMN "from_advance" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "customer_advances" ADD CONSTRAINT "customer_advances_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_advances" ADD CONSTRAINT "customer_advances_customer_id_people_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_advances" ADD CONSTRAINT "customer_advances_bank_account_id_bank_accounts_id_fk" FOREIGN KEY ("bank_account_id") REFERENCES "public"."bank_accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_advances" ADD CONSTRAINT "customer_advances_payment_id_receivable_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."receivable_payments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_advances" ADD CONSTRAINT "customer_advances_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_advances" ADD CONSTRAINT "customer_advances_reversed_by_users_id_fk" FOREIGN KEY ("reversed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "customer_advances_company_id_customer_id_index" ON "customer_advances" USING btree ("company_id","customer_id");--> statement-breakpoint
CREATE INDEX "customer_advances_payment_id_index" ON "customer_advances" USING btree ("payment_id");--> statement-breakpoint
ALTER TABLE "cash_transactions" ADD CONSTRAINT "cash_transactions_advance_id_customer_advances_id_fk" FOREIGN KEY ("advance_id") REFERENCES "public"."customer_advances"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "cash_transactions_advance_id_index" ON "cash_transactions" USING btree ("advance_id");