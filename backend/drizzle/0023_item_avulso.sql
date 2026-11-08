ALTER TABLE "order_items" ALTER COLUMN "product_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "quote_items" ALTER COLUMN "product_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "description" varchar(160);--> statement-breakpoint
ALTER TABLE "quote_items" ADD COLUMN "description" varchar(160);--> statement-breakpoint
-- Todo item tem produto ou, se avulso, descrição.
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_product_or_description" CHECK ("product_id" IS NOT NULL OR "description" IS NOT NULL);--> statement-breakpoint
ALTER TABLE "quote_items" ADD CONSTRAINT "quote_items_product_or_description" CHECK ("product_id" IS NOT NULL OR "description" IS NOT NULL);
