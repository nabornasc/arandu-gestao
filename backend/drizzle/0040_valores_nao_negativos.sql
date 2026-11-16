-- Valores de dinheiro nunca negativos; adiantamento, meta e limite do MEI maiores que zero.
-- Equivalente às validações do código (packages/shared/src/schemas). Para voltar:
-- ALTER TABLE "ai_usage" DROP CONSTRAINT "ai_usage_cost_usd_nao_negativo";
-- ALTER TABLE "ai_usage" DROP CONSTRAINT "ai_usage_cost_brl_nao_negativo";
-- ALTER TABLE "cash_transactions" DROP CONSTRAINT "cash_transactions_amount_nao_negativo";
-- ALTER TABLE "companies" DROP CONSTRAINT "companies_ai_monthly_quota_nao_negativo";
-- ALTER TABLE "companies" DROP CONSTRAINT "companies_mei_annual_limit_positivo";
-- ALTER TABLE "customer_advances" DROP CONSTRAINT "customer_advances_amount_positivo";
-- ALTER TABLE "expense_payments" DROP CONSTRAINT "expense_payments_principal_nao_negativo";
-- ALTER TABLE "expense_payments" DROP CONSTRAINT "expense_payments_interest_nao_negativo";
-- ALTER TABLE "expense_payments" DROP CONSTRAINT "expense_payments_discount_nao_negativo";
-- ALTER TABLE "expense_payments" DROP CONSTRAINT "expense_payments_paid_nao_negativo";
-- ALTER TABLE "expenses" DROP CONSTRAINT "expenses_amount_nao_negativo";
-- ALTER TABLE "expenses" DROP CONSTRAINT "expenses_paid_amount_nao_negativo";
-- ALTER TABLE "opportunities" DROP CONSTRAINT "opportunities_estimated_value_nao_negativo";
-- ALTER TABLE "opportunity_items" DROP CONSTRAINT "opportunity_items_unit_price_nao_negativo";
-- ALTER TABLE "order_items" DROP CONSTRAINT "order_items_unit_price_nao_negativo";
-- ALTER TABLE "order_items" DROP CONSTRAINT "order_items_subtotal_nao_negativo";
-- ALTER TABLE "orders" DROP CONSTRAINT "orders_discount_nao_negativo";
-- ALTER TABLE "orders" DROP CONSTRAINT "orders_total_nao_negativo";
-- ALTER TABLE "orders" DROP CONSTRAINT "orders_freight_nao_negativo";
-- ALTER TABLE "orders" DROP CONSTRAINT "orders_other_charges_nao_negativo";
-- ALTER TABLE "people" DROP CONSTRAINT "people_credit_limit_nao_negativo";
-- ALTER TABLE "products" DROP CONSTRAINT "products_price_nao_negativo";
-- ALTER TABLE "products" DROP CONSTRAINT "products_cost_nao_negativo";
-- ALTER TABLE "purchase_items" DROP CONSTRAINT "purchase_items_unit_cost_nao_negativo";
-- ALTER TABLE "purchase_items" DROP CONSTRAINT "purchase_items_subtotal_nao_negativo";
-- ALTER TABLE "purchases" DROP CONSTRAINT "purchases_freight_nao_negativo";
-- ALTER TABLE "purchases" DROP CONSTRAINT "purchases_total_nao_negativo";
-- ALTER TABLE "quote_items" DROP CONSTRAINT "quote_items_unit_price_nao_negativo";
-- ALTER TABLE "quote_items" DROP CONSTRAINT "quote_items_subtotal_nao_negativo";
-- ALTER TABLE "quote_items" DROP CONSTRAINT "quote_items_unit_cost_nao_negativo";
-- ALTER TABLE "quotes" DROP CONSTRAINT "quotes_discount_nao_negativo";
-- ALTER TABLE "quotes" DROP CONSTRAINT "quotes_total_nao_negativo";
-- ALTER TABLE "quotes" DROP CONSTRAINT "quotes_freight_nao_negativo";
-- ALTER TABLE "quotes" DROP CONSTRAINT "quotes_other_charges_nao_negativo";
-- ALTER TABLE "receivable_payments" DROP CONSTRAINT "receivable_payments_principal_nao_negativo";
-- ALTER TABLE "receivable_payments" DROP CONSTRAINT "receivable_payments_interest_nao_negativo";
-- ALTER TABLE "receivable_payments" DROP CONSTRAINT "receivable_payments_discount_nao_negativo";
-- ALTER TABLE "receivable_payments" DROP CONSTRAINT "receivable_payments_received_nao_negativo";
-- ALTER TABLE "receivables" DROP CONSTRAINT "receivables_amount_nao_negativo";
-- ALTER TABLE "receivables" DROP CONSTRAINT "receivables_paid_amount_nao_negativo";
-- ALTER TABLE "sales_goals" DROP CONSTRAINT "sales_goals_amount_positivo";

ALTER TABLE "ai_usage" ADD CONSTRAINT "ai_usage_cost_usd_nao_negativo" CHECK ("ai_usage"."cost_usd" >= 0);--> statement-breakpoint
ALTER TABLE "ai_usage" ADD CONSTRAINT "ai_usage_cost_brl_nao_negativo" CHECK ("ai_usage"."cost_brl" >= 0);--> statement-breakpoint
ALTER TABLE "cash_transactions" ADD CONSTRAINT "cash_transactions_amount_nao_negativo" CHECK ("cash_transactions"."amount" >= 0);--> statement-breakpoint
ALTER TABLE "companies" ADD CONSTRAINT "companies_ai_monthly_quota_nao_negativo" CHECK ("companies"."ai_monthly_quota" >= 0);--> statement-breakpoint
ALTER TABLE "companies" ADD CONSTRAINT "companies_mei_annual_limit_positivo" CHECK ("companies"."mei_annual_limit" > 0);--> statement-breakpoint
ALTER TABLE "customer_advances" ADD CONSTRAINT "customer_advances_amount_positivo" CHECK ("customer_advances"."amount" > 0);--> statement-breakpoint
ALTER TABLE "expense_payments" ADD CONSTRAINT "expense_payments_principal_nao_negativo" CHECK ("expense_payments"."principal" >= 0);--> statement-breakpoint
ALTER TABLE "expense_payments" ADD CONSTRAINT "expense_payments_interest_nao_negativo" CHECK ("expense_payments"."interest" >= 0);--> statement-breakpoint
ALTER TABLE "expense_payments" ADD CONSTRAINT "expense_payments_discount_nao_negativo" CHECK ("expense_payments"."discount" >= 0);--> statement-breakpoint
ALTER TABLE "expense_payments" ADD CONSTRAINT "expense_payments_paid_nao_negativo" CHECK ("expense_payments"."paid" >= 0);--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_amount_nao_negativo" CHECK ("expenses"."amount" >= 0);--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_paid_amount_nao_negativo" CHECK ("expenses"."paid_amount" >= 0);--> statement-breakpoint
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_estimated_value_nao_negativo" CHECK ("opportunities"."estimated_value" >= 0);--> statement-breakpoint
ALTER TABLE "opportunity_items" ADD CONSTRAINT "opportunity_items_unit_price_nao_negativo" CHECK ("opportunity_items"."unit_price" >= 0);--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_unit_price_nao_negativo" CHECK ("order_items"."unit_price" >= 0);--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_subtotal_nao_negativo" CHECK ("order_items"."subtotal" >= 0);--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_discount_nao_negativo" CHECK ("orders"."discount" >= 0);--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_total_nao_negativo" CHECK ("orders"."total" >= 0);--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_freight_nao_negativo" CHECK ("orders"."freight" >= 0);--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_other_charges_nao_negativo" CHECK ("orders"."other_charges" >= 0);--> statement-breakpoint
ALTER TABLE "people" ADD CONSTRAINT "people_credit_limit_nao_negativo" CHECK ("people"."credit_limit" >= 0);--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_price_nao_negativo" CHECK ("products"."price" >= 0);--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_cost_nao_negativo" CHECK ("products"."cost" >= 0);--> statement-breakpoint
ALTER TABLE "purchase_items" ADD CONSTRAINT "purchase_items_unit_cost_nao_negativo" CHECK ("purchase_items"."unit_cost" >= 0);--> statement-breakpoint
ALTER TABLE "purchase_items" ADD CONSTRAINT "purchase_items_subtotal_nao_negativo" CHECK ("purchase_items"."subtotal" >= 0);--> statement-breakpoint
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_freight_nao_negativo" CHECK ("purchases"."freight" >= 0);--> statement-breakpoint
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_total_nao_negativo" CHECK ("purchases"."total" >= 0);--> statement-breakpoint
ALTER TABLE "quote_items" ADD CONSTRAINT "quote_items_unit_price_nao_negativo" CHECK ("quote_items"."unit_price" >= 0);--> statement-breakpoint
ALTER TABLE "quote_items" ADD CONSTRAINT "quote_items_subtotal_nao_negativo" CHECK ("quote_items"."subtotal" >= 0);--> statement-breakpoint
ALTER TABLE "quote_items" ADD CONSTRAINT "quote_items_unit_cost_nao_negativo" CHECK ("quote_items"."unit_cost" >= 0);--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_discount_nao_negativo" CHECK ("quotes"."discount" >= 0);--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_total_nao_negativo" CHECK ("quotes"."total" >= 0);--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_freight_nao_negativo" CHECK ("quotes"."freight" >= 0);--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_other_charges_nao_negativo" CHECK ("quotes"."other_charges" >= 0);--> statement-breakpoint
ALTER TABLE "receivable_payments" ADD CONSTRAINT "receivable_payments_principal_nao_negativo" CHECK ("receivable_payments"."principal" >= 0);--> statement-breakpoint
ALTER TABLE "receivable_payments" ADD CONSTRAINT "receivable_payments_interest_nao_negativo" CHECK ("receivable_payments"."interest" >= 0);--> statement-breakpoint
ALTER TABLE "receivable_payments" ADD CONSTRAINT "receivable_payments_discount_nao_negativo" CHECK ("receivable_payments"."discount" >= 0);--> statement-breakpoint
ALTER TABLE "receivable_payments" ADD CONSTRAINT "receivable_payments_received_nao_negativo" CHECK ("receivable_payments"."received" >= 0);--> statement-breakpoint
ALTER TABLE "receivables" ADD CONSTRAINT "receivables_amount_nao_negativo" CHECK ("receivables"."amount" >= 0);--> statement-breakpoint
ALTER TABLE "receivables" ADD CONSTRAINT "receivables_paid_amount_nao_negativo" CHECK ("receivables"."paid_amount" >= 0);--> statement-breakpoint
ALTER TABLE "sales_goals" ADD CONSTRAINT "sales_goals_amount_positivo" CHECK ("sales_goals"."amount" > 0);