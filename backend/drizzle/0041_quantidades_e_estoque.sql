-- Quantidade dos itens maior que zero; estoque, estoque mínimo e saldo do extrato nunca negativos.
-- Equivalente às validações do código (packages/shared/src/schemas). Para voltar:
-- ALTER TABLE "opportunity_items" DROP CONSTRAINT "opportunity_items_quantity_positiva";
-- ALTER TABLE "order_items" DROP CONSTRAINT "order_items_quantity_positiva";
-- ALTER TABLE "products" DROP CONSTRAINT "products_stock_nao_negativo";
-- ALTER TABLE "products" DROP CONSTRAINT "products_min_stock_nao_negativo";
-- ALTER TABLE "purchase_items" DROP CONSTRAINT "purchase_items_quantity_positiva";
-- ALTER TABLE "quote_items" DROP CONSTRAINT "quote_items_quantity_positiva";
-- ALTER TABLE "stock_movements" DROP CONSTRAINT "stock_movements_balance_nao_negativo";

ALTER TABLE "opportunity_items" ADD CONSTRAINT "opportunity_items_quantity_positiva" CHECK ("opportunity_items"."quantity" > 0);--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_quantity_positiva" CHECK ("order_items"."quantity" > 0);--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_stock_nao_negativo" CHECK ("products"."stock" >= 0);--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_min_stock_nao_negativo" CHECK ("products"."min_stock" >= 0);--> statement-breakpoint
ALTER TABLE "purchase_items" ADD CONSTRAINT "purchase_items_quantity_positiva" CHECK ("purchase_items"."quantity" > 0);--> statement-breakpoint
ALTER TABLE "quote_items" ADD CONSTRAINT "quote_items_quantity_positiva" CHECK ("quote_items"."quantity" > 0);--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_balance_nao_negativo" CHECK ("stock_movements"."balance" >= 0);