CREATE TABLE "rate_limits" (
	"key" varchar(100) PRIMARY KEY NOT NULL,
	"count" integer NOT NULL,
	"reset_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE INDEX "rate_limits_reset_at_index" ON "rate_limits" USING btree ("reset_at");