CREATE TABLE "agenda_events" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "agenda_events_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"company_id" integer NOT NULL,
	"title" varchar(160) NOT NULL,
	"date" date NOT NULL,
	"time" time(0),
	"notes" varchar(500),
	"done" boolean DEFAULT false NOT NULL,
	"created_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agenda_events" ADD CONSTRAINT "agenda_events_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agenda_events" ADD CONSTRAINT "agenda_events_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agenda_events_company_id_date_index" ON "agenda_events" USING btree ("company_id","date");--> statement-breakpoint
-- Todo grupo vê a agenda: cada item continua exigindo a leitura do seu módulo.
INSERT INTO "access_group_permissions" ("group_id", "permission")
SELECT "id", 'agenda.read' FROM "access_groups" WHERE NOT "is_owner"
ON CONFLICT DO NOTHING;--> statement-breakpoint
-- Quem atende clientes no CRM passa a lançar as próprias tarefas.
INSERT INTO "access_group_permissions" ("group_id", "permission")
SELECT g."group_id", p."permission"
FROM "access_group_permissions" g
CROSS JOIN (VALUES ('agenda.create'), ('agenda.update'), ('agenda.delete')) AS p("permission")
WHERE g."permission" = 'opportunities.update'
ON CONFLICT DO NOTHING;
