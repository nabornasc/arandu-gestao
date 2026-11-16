-- Índices em chaves estrangeiras usadas por consultas reais (medido com 100 mil pedidos em dev):
--   stock_movements(order_id)    excluir ou editar pedido: o extrato perde o vínculo (12,2 ms -> 0,2 ms)
--   stock_movements(product_id)  excluir produto não usado: apaga o extrato inicial (14,6 ms -> 2,6 ms)
--   orders(customer_id)          ficha do cliente e "cliente em uso" antes de excluir
--   quotes(customer_id)          orçamentos da ficha do cliente e "cliente em uso"
--   quote_items(product_id)      "produto em uso" antes de excluir
--   opportunity_items(product_id) "produto em uso" antes de excluir
--   people(carrier_id)           "transportadora em uso" antes de excluir
--   ai_usage(user_id, created_at) limite de mensagens por minuto do Telegram (1,1 ms -> 0,08 ms)
-- Para voltar:
-- DROP INDEX "ai_usage_user_id_created_at_index";
-- DROP INDEX "opportunity_items_product_id_index";
-- DROP INDEX "orders_customer_id_index";
-- DROP INDEX "people_carrier_id_index";
-- DROP INDEX "quote_items_product_id_index";
-- DROP INDEX "quotes_customer_id_index";
-- DROP INDEX "stock_movements_order_id_index";
-- DROP INDEX "stock_movements_product_id_index";

CREATE INDEX "ai_usage_user_id_created_at_index" ON "ai_usage" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "opportunity_items_product_id_index" ON "opportunity_items" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "orders_customer_id_index" ON "orders" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "people_carrier_id_index" ON "people" USING btree ("carrier_id");--> statement-breakpoint
CREATE INDEX "quote_items_product_id_index" ON "quote_items" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "quotes_customer_id_index" ON "quotes" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "stock_movements_order_id_index" ON "stock_movements" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "stock_movements_product_id_index" ON "stock_movements" USING btree ("product_id");