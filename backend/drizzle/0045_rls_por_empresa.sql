-- Isolamento entre empresas no banco (B1 da auditoria do banco).
-- A aplicação define, em cada transação, app.company_id (empresa da sessão) ou app.bypass = 'on' (modo
-- sistema: login, sessão, webhook antes de identificar a conversa, limpezas). Ver backend/src/lib/tenant.ts.
-- Sem nenhum dos dois, as tabelas da empresa não mostram linha. As policies valem para todos os papéis:
-- o dono das tabelas e o arandue_backup (BYPASSRLS) não passam por elas; anon e authenticated não têm GRANT.
--
-- Para voltar ao estado anterior (aplicação vê tudo; isolamento só no código), para cada tabela:
--   DROP POLICY IF EXISTS empresa ON <tabela>;
--   CREATE POLICY arandue_app_all ON <tabela> TO arandue_app USING (true) WITH CHECK (true);
-- e, nas três tabelas globais, DROP POLICY IF EXISTS registro_global ON <tabela>.

-- Tabelas com company_id: só as linhas da empresa da requisição.
ALTER TABLE access_groups ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS arandue_app_all ON access_groups;--> statement-breakpoint
CREATE POLICY empresa ON access_groups USING (current_setting('app.bypass', true) = 'on' OR company_id = nullif(current_setting('app.company_id', true), '')::integer) WITH CHECK (current_setting('app.bypass', true) = 'on' OR company_id = nullif(current_setting('app.company_id', true), '')::integer);--> statement-breakpoint
ALTER TABLE agenda_events ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS arandue_app_all ON agenda_events;--> statement-breakpoint
CREATE POLICY empresa ON agenda_events USING (current_setting('app.bypass', true) = 'on' OR company_id = nullif(current_setting('app.company_id', true), '')::integer) WITH CHECK (current_setting('app.bypass', true) = 'on' OR company_id = nullif(current_setting('app.company_id', true), '')::integer);--> statement-breakpoint
ALTER TABLE ai_pending_actions ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS arandue_app_all ON ai_pending_actions;--> statement-breakpoint
CREATE POLICY empresa ON ai_pending_actions USING (current_setting('app.bypass', true) = 'on' OR company_id = nullif(current_setting('app.company_id', true), '')::integer) WITH CHECK (current_setting('app.bypass', true) = 'on' OR company_id = nullif(current_setting('app.company_id', true), '')::integer);--> statement-breakpoint
ALTER TABLE ai_usage ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS arandue_app_all ON ai_usage;--> statement-breakpoint
CREATE POLICY empresa ON ai_usage USING (current_setting('app.bypass', true) = 'on' OR company_id = nullif(current_setting('app.company_id', true), '')::integer) WITH CHECK (current_setting('app.bypass', true) = 'on' OR company_id = nullif(current_setting('app.company_id', true), '')::integer);--> statement-breakpoint
ALTER TABLE attachments ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS arandue_app_all ON attachments;--> statement-breakpoint
CREATE POLICY empresa ON attachments USING (current_setting('app.bypass', true) = 'on' OR company_id = nullif(current_setting('app.company_id', true), '')::integer) WITH CHECK (current_setting('app.bypass', true) = 'on' OR company_id = nullif(current_setting('app.company_id', true), '')::integer);--> statement-breakpoint
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS arandue_app_all ON audit_logs;--> statement-breakpoint
CREATE POLICY empresa ON audit_logs USING (current_setting('app.bypass', true) = 'on' OR company_id = nullif(current_setting('app.company_id', true), '')::integer) WITH CHECK (current_setting('app.bypass', true) = 'on' OR company_id = nullif(current_setting('app.company_id', true), '')::integer);--> statement-breakpoint
ALTER TABLE bank_accounts ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS arandue_app_all ON bank_accounts;--> statement-breakpoint
CREATE POLICY empresa ON bank_accounts USING (current_setting('app.bypass', true) = 'on' OR company_id = nullif(current_setting('app.company_id', true), '')::integer) WITH CHECK (current_setting('app.bypass', true) = 'on' OR company_id = nullif(current_setting('app.company_id', true), '')::integer);--> statement-breakpoint
ALTER TABLE cash_transactions ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS arandue_app_all ON cash_transactions;--> statement-breakpoint
CREATE POLICY empresa ON cash_transactions USING (current_setting('app.bypass', true) = 'on' OR company_id = nullif(current_setting('app.company_id', true), '')::integer) WITH CHECK (current_setting('app.bypass', true) = 'on' OR company_id = nullif(current_setting('app.company_id', true), '')::integer);--> statement-breakpoint
ALTER TABLE company_list_items ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS arandue_app_all ON company_list_items;--> statement-breakpoint
CREATE POLICY empresa ON company_list_items USING (current_setting('app.bypass', true) = 'on' OR company_id = nullif(current_setting('app.company_id', true), '')::integer) WITH CHECK (current_setting('app.bypass', true) = 'on' OR company_id = nullif(current_setting('app.company_id', true), '')::integer);--> statement-breakpoint
ALTER TABLE customer_advances ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS arandue_app_all ON customer_advances;--> statement-breakpoint
CREATE POLICY empresa ON customer_advances USING (current_setting('app.bypass', true) = 'on' OR company_id = nullif(current_setting('app.company_id', true), '')::integer) WITH CHECK (current_setting('app.bypass', true) = 'on' OR company_id = nullif(current_setting('app.company_id', true), '')::integer);--> statement-breakpoint
ALTER TABLE events ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS arandue_app_all ON events;--> statement-breakpoint
CREATE POLICY empresa ON events USING (current_setting('app.bypass', true) = 'on' OR company_id = nullif(current_setting('app.company_id', true), '')::integer) WITH CHECK (current_setting('app.bypass', true) = 'on' OR company_id = nullif(current_setting('app.company_id', true), '')::integer);--> statement-breakpoint
ALTER TABLE expense_payments ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS arandue_app_all ON expense_payments;--> statement-breakpoint
CREATE POLICY empresa ON expense_payments USING (current_setting('app.bypass', true) = 'on' OR company_id = nullif(current_setting('app.company_id', true), '')::integer) WITH CHECK (current_setting('app.bypass', true) = 'on' OR company_id = nullif(current_setting('app.company_id', true), '')::integer);--> statement-breakpoint
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS arandue_app_all ON expenses;--> statement-breakpoint
CREATE POLICY empresa ON expenses USING (current_setting('app.bypass', true) = 'on' OR company_id = nullif(current_setting('app.company_id', true), '')::integer) WITH CHECK (current_setting('app.bypass', true) = 'on' OR company_id = nullif(current_setting('app.company_id', true), '')::integer);--> statement-breakpoint
ALTER TABLE interactions ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS arandue_app_all ON interactions;--> statement-breakpoint
CREATE POLICY empresa ON interactions USING (current_setting('app.bypass', true) = 'on' OR company_id = nullif(current_setting('app.company_id', true), '')::integer) WITH CHECK (current_setting('app.bypass', true) = 'on' OR company_id = nullif(current_setting('app.company_id', true), '')::integer);--> statement-breakpoint
ALTER TABLE item_templates ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS arandue_app_all ON item_templates;--> statement-breakpoint
CREATE POLICY empresa ON item_templates USING (current_setting('app.bypass', true) = 'on' OR company_id = nullif(current_setting('app.company_id', true), '')::integer) WITH CHECK (current_setting('app.bypass', true) = 'on' OR company_id = nullif(current_setting('app.company_id', true), '')::integer);--> statement-breakpoint
ALTER TABLE opportunities ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS arandue_app_all ON opportunities;--> statement-breakpoint
CREATE POLICY empresa ON opportunities USING (current_setting('app.bypass', true) = 'on' OR company_id = nullif(current_setting('app.company_id', true), '')::integer) WITH CHECK (current_setting('app.bypass', true) = 'on' OR company_id = nullif(current_setting('app.company_id', true), '')::integer);--> statement-breakpoint
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS arandue_app_all ON orders;--> statement-breakpoint
CREATE POLICY empresa ON orders USING (current_setting('app.bypass', true) = 'on' OR company_id = nullif(current_setting('app.company_id', true), '')::integer) WITH CHECK (current_setting('app.bypass', true) = 'on' OR company_id = nullif(current_setting('app.company_id', true), '')::integer);--> statement-breakpoint
ALTER TABLE payment_conditions ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS arandue_app_all ON payment_conditions;--> statement-breakpoint
CREATE POLICY empresa ON payment_conditions USING (current_setting('app.bypass', true) = 'on' OR company_id = nullif(current_setting('app.company_id', true), '')::integer) WITH CHECK (current_setting('app.bypass', true) = 'on' OR company_id = nullif(current_setting('app.company_id', true), '')::integer);--> statement-breakpoint
ALTER TABLE people ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS arandue_app_all ON people;--> statement-breakpoint
CREATE POLICY empresa ON people USING (current_setting('app.bypass', true) = 'on' OR company_id = nullif(current_setting('app.company_id', true), '')::integer) WITH CHECK (current_setting('app.bypass', true) = 'on' OR company_id = nullif(current_setting('app.company_id', true), '')::integer);--> statement-breakpoint
ALTER TABLE pipeline_stages ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS arandue_app_all ON pipeline_stages;--> statement-breakpoint
CREATE POLICY empresa ON pipeline_stages USING (current_setting('app.bypass', true) = 'on' OR company_id = nullif(current_setting('app.company_id', true), '')::integer) WITH CHECK (current_setting('app.bypass', true) = 'on' OR company_id = nullif(current_setting('app.company_id', true), '')::integer);--> statement-breakpoint
ALTER TABLE products ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS arandue_app_all ON products;--> statement-breakpoint
CREATE POLICY empresa ON products USING (current_setting('app.bypass', true) = 'on' OR company_id = nullif(current_setting('app.company_id', true), '')::integer) WITH CHECK (current_setting('app.bypass', true) = 'on' OR company_id = nullif(current_setting('app.company_id', true), '')::integer);--> statement-breakpoint
ALTER TABLE purchases ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS arandue_app_all ON purchases;--> statement-breakpoint
CREATE POLICY empresa ON purchases USING (current_setting('app.bypass', true) = 'on' OR company_id = nullif(current_setting('app.company_id', true), '')::integer) WITH CHECK (current_setting('app.bypass', true) = 'on' OR company_id = nullif(current_setting('app.company_id', true), '')::integer);--> statement-breakpoint
ALTER TABLE quotes ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS arandue_app_all ON quotes;--> statement-breakpoint
CREATE POLICY empresa ON quotes USING (current_setting('app.bypass', true) = 'on' OR company_id = nullif(current_setting('app.company_id', true), '')::integer) WITH CHECK (current_setting('app.bypass', true) = 'on' OR company_id = nullif(current_setting('app.company_id', true), '')::integer);--> statement-breakpoint
ALTER TABLE receivable_payments ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS arandue_app_all ON receivable_payments;--> statement-breakpoint
CREATE POLICY empresa ON receivable_payments USING (current_setting('app.bypass', true) = 'on' OR company_id = nullif(current_setting('app.company_id', true), '')::integer) WITH CHECK (current_setting('app.bypass', true) = 'on' OR company_id = nullif(current_setting('app.company_id', true), '')::integer);--> statement-breakpoint
ALTER TABLE receivables ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS arandue_app_all ON receivables;--> statement-breakpoint
CREATE POLICY empresa ON receivables USING (current_setting('app.bypass', true) = 'on' OR company_id = nullif(current_setting('app.company_id', true), '')::integer) WITH CHECK (current_setting('app.bypass', true) = 'on' OR company_id = nullif(current_setting('app.company_id', true), '')::integer);--> statement-breakpoint
ALTER TABLE sales_goals ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS arandue_app_all ON sales_goals;--> statement-breakpoint
CREATE POLICY empresa ON sales_goals USING (current_setting('app.bypass', true) = 'on' OR company_id = nullif(current_setting('app.company_id', true), '')::integer) WITH CHECK (current_setting('app.bypass', true) = 'on' OR company_id = nullif(current_setting('app.company_id', true), '')::integer);--> statement-breakpoint
ALTER TABLE stock_movements ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS arandue_app_all ON stock_movements;--> statement-breakpoint
CREATE POLICY empresa ON stock_movements USING (current_setting('app.bypass', true) = 'on' OR company_id = nullif(current_setting('app.company_id', true), '')::integer) WITH CHECK (current_setting('app.bypass', true) = 'on' OR company_id = nullif(current_setting('app.company_id', true), '')::integer);--> statement-breakpoint
ALTER TABLE telegram_messages ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS arandue_app_all ON telegram_messages;--> statement-breakpoint
CREATE POLICY empresa ON telegram_messages USING (current_setting('app.bypass', true) = 'on' OR company_id = nullif(current_setting('app.company_id', true), '')::integer) WITH CHECK (current_setting('app.bypass', true) = 'on' OR company_id = nullif(current_setting('app.company_id', true), '')::integer);--> statement-breakpoint
ALTER TABLE text_snippets ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS arandue_app_all ON text_snippets;--> statement-breakpoint
CREATE POLICY empresa ON text_snippets USING (current_setting('app.bypass', true) = 'on' OR company_id = nullif(current_setting('app.company_id', true), '')::integer) WITH CHECK (current_setting('app.bypass', true) = 'on' OR company_id = nullif(current_setting('app.company_id', true), '')::integer);--> statement-breakpoint
ALTER TABLE users ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS arandue_app_all ON users;--> statement-breakpoint
CREATE POLICY empresa ON users USING (current_setting('app.bypass', true) = 'on' OR company_id = nullif(current_setting('app.company_id', true), '')::integer) WITH CHECK (current_setting('app.bypass', true) = 'on' OR company_id = nullif(current_setting('app.company_id', true), '')::integer);--> statement-breakpoint
-- A própria empresa.
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS arandue_app_all ON companies;--> statement-breakpoint
CREATE POLICY empresa ON companies USING (current_setting('app.bypass', true) = 'on' OR id = nullif(current_setting('app.company_id', true), '')::integer) WITH CHECK (current_setting('app.bypass', true) = 'on' OR id = nullif(current_setting('app.company_id', true), '')::integer);--> statement-breakpoint
-- Tabelas filhas: a linha é visível se o registro pai é (o pai já passa pelo RLS da empresa).
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS arandue_app_all ON order_items;--> statement-breakpoint
CREATE POLICY empresa ON order_items USING (current_setting('app.bypass', true) = 'on' OR EXISTS (SELECT 1 FROM orders WHERE orders.id = order_items.order_id)) WITH CHECK (current_setting('app.bypass', true) = 'on' OR EXISTS (SELECT 1 FROM orders WHERE orders.id = order_items.order_id));--> statement-breakpoint
ALTER TABLE quote_items ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS arandue_app_all ON quote_items;--> statement-breakpoint
CREATE POLICY empresa ON quote_items USING (current_setting('app.bypass', true) = 'on' OR EXISTS (SELECT 1 FROM quotes WHERE quotes.id = quote_items.quote_id)) WITH CHECK (current_setting('app.bypass', true) = 'on' OR EXISTS (SELECT 1 FROM quotes WHERE quotes.id = quote_items.quote_id));--> statement-breakpoint
ALTER TABLE purchase_items ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS arandue_app_all ON purchase_items;--> statement-breakpoint
CREATE POLICY empresa ON purchase_items USING (current_setting('app.bypass', true) = 'on' OR EXISTS (SELECT 1 FROM purchases WHERE purchases.id = purchase_items.purchase_id)) WITH CHECK (current_setting('app.bypass', true) = 'on' OR EXISTS (SELECT 1 FROM purchases WHERE purchases.id = purchase_items.purchase_id));--> statement-breakpoint
ALTER TABLE opportunity_items ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS arandue_app_all ON opportunity_items;--> statement-breakpoint
CREATE POLICY empresa ON opportunity_items USING (current_setting('app.bypass', true) = 'on' OR EXISTS (SELECT 1 FROM opportunities WHERE opportunities.id = opportunity_items.opportunity_id)) WITH CHECK (current_setting('app.bypass', true) = 'on' OR EXISTS (SELECT 1 FROM opportunities WHERE opportunities.id = opportunity_items.opportunity_id));--> statement-breakpoint
ALTER TABLE person_contacts ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS arandue_app_all ON person_contacts;--> statement-breakpoint
CREATE POLICY empresa ON person_contacts USING (current_setting('app.bypass', true) = 'on' OR EXISTS (SELECT 1 FROM people WHERE people.id = person_contacts.person_id)) WITH CHECK (current_setting('app.bypass', true) = 'on' OR EXISTS (SELECT 1 FROM people WHERE people.id = person_contacts.person_id));--> statement-breakpoint
ALTER TABLE person_addresses ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS arandue_app_all ON person_addresses;--> statement-breakpoint
CREATE POLICY empresa ON person_addresses USING (current_setting('app.bypass', true) = 'on' OR EXISTS (SELECT 1 FROM people WHERE people.id = person_addresses.person_id)) WITH CHECK (current_setting('app.bypass', true) = 'on' OR EXISTS (SELECT 1 FROM people WHERE people.id = person_addresses.person_id));--> statement-breakpoint
ALTER TABLE access_group_permissions ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS arandue_app_all ON access_group_permissions;--> statement-breakpoint
CREATE POLICY empresa ON access_group_permissions USING (current_setting('app.bypass', true) = 'on' OR EXISTS (SELECT 1 FROM access_groups WHERE access_groups.id = access_group_permissions.group_id)) WITH CHECK (current_setting('app.bypass', true) = 'on' OR EXISTS (SELECT 1 FROM access_groups WHERE access_groups.id = access_group_permissions.group_id));--> statement-breakpoint
ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS arandue_app_all ON user_preferences;--> statement-breakpoint
CREATE POLICY empresa ON user_preferences USING (current_setting('app.bypass', true) = 'on' OR EXISTS (SELECT 1 FROM users WHERE users.id = user_preferences.user_id)) WITH CHECK (current_setting('app.bypass', true) = 'on' OR EXISTS (SELECT 1 FROM users WHERE users.id = user_preferences.user_id));--> statement-breakpoint
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS arandue_app_all ON sessions;--> statement-breakpoint
CREATE POLICY empresa ON sessions USING (current_setting('app.bypass', true) = 'on' OR EXISTS (SELECT 1 FROM users WHERE users.id = sessions.user_id)) WITH CHECK (current_setting('app.bypass', true) = 'on' OR EXISTS (SELECT 1 FROM users WHERE users.id = sessions.user_id));--> statement-breakpoint
-- Tabelas globais, sem dono: só hashes e IDs do Telegram.
ALTER TABLE rate_limits ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS arandue_app_all ON rate_limits;--> statement-breakpoint
CREATE POLICY registro_global ON rate_limits USING (true) WITH CHECK (true);--> statement-breakpoint
ALTER TABLE telegram_updates ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS arandue_app_all ON telegram_updates;--> statement-breakpoint
CREATE POLICY registro_global ON telegram_updates USING (true) WITH CHECK (true);--> statement-breakpoint
ALTER TABLE telegram_link_failures ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS arandue_app_all ON telegram_link_failures;--> statement-breakpoint
CREATE POLICY registro_global ON telegram_link_failures USING (true) WITH CHECK (true);
