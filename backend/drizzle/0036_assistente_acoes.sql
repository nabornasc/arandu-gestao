CREATE TABLE "ai_pending_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"channel" varchar(20) NOT NULL,
	"kind" varchar(30) NOT NULL,
	"payload" jsonb NOT NULL,
	"summary" text NOT NULL,
	"status" varchar(12) DEFAULT 'pending' NOT NULL,
	"result_path" varchar(200),
	"expires_at" timestamp with time zone NOT NULL,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_pending_actions" ADD CONSTRAINT "ai_pending_actions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_pending_actions" ADD CONSTRAINT "ai_pending_actions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_pending_actions_user_id_status_index" ON "ai_pending_actions" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "ai_pending_actions_created_at_index" ON "ai_pending_actions" USING btree ("created_at");