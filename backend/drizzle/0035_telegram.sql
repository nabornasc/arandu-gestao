CREATE TABLE "telegram_link_failures" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "telegram_link_failures_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"chat_id" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "telegram_messages" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "telegram_messages_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"company_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"role" varchar(10) NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "telegram_chat_id" bigint;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "telegram_link_code" varchar(64);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "telegram_link_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "telegram_messages" ADD CONSTRAINT "telegram_messages_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "telegram_messages" ADD CONSTRAINT "telegram_messages_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "telegram_link_failures_chat_id_created_at_index" ON "telegram_link_failures" USING btree ("chat_id","created_at");--> statement-breakpoint
CREATE INDEX "telegram_messages_user_id_created_at_index" ON "telegram_messages" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "users_telegram_chat_unique" ON "users" USING btree ("telegram_chat_id");--> statement-breakpoint
CREATE INDEX "users_telegram_link_code_index" ON "users" USING btree ("telegram_link_code");