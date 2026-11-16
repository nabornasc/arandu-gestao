-- Proteção do banco no Supabase. Rode depois de cada migração: é seguro repetir.
--
-- O Supabase publica o schema public por uma API própria, acessível com a chave pública do projeto.
-- O Arandu Gestão não usa essa API, então os papéis dela perdem o acesso e toda tabela fica com RLS ligado.
-- A aplicação conecta como arandue_app, sem poder de alterar a estrutura do banco.

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL ROUTINES IN SCHEMA public FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON ROUTINES FROM anon, authenticated;

GRANT USAGE ON SCHEMA public TO arandue_app;

-- Permissões da aplicação: só o que o código do backend usa em cada tabela. Tabela nova precisa de uma
-- linha aqui: o teste backend/src/tests/appGrants.test.ts falha se faltar. `events` fica de fora: o código
-- não lê nem grava nela. As colunas identity não exigem permissão nas sequências.
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM arandue_app;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM arandue_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON
  access_groups, agenda_events, ai_pending_actions, ai_usage, attachments, bank_accounts, cash_transactions,
  expenses, opportunities, orders, people, pipeline_stages, products, quote_items, quotes, receivable_payments,
  sales_goals, sessions
TO arandue_app;

-- Upsert (INSERT ... ON CONFLICT DO UPDATE) e SELECT ... FOR UPDATE exigem UPDATE, mesmo sem alterar a linha.
GRANT SELECT, INSERT, UPDATE, DELETE ON rate_limits TO arandue_app;
GRANT SELECT, INSERT, UPDATE ON user_preferences TO arandue_app;

GRANT SELECT, INSERT, UPDATE ON
  companies, company_list_items, customer_advances, expense_payments, item_templates, payment_conditions,
  purchases, receivables, text_snippets, users
TO arandue_app;

GRANT SELECT, INSERT, DELETE ON
  access_group_permissions, opportunity_items, person_addresses, person_contacts, purchase_items,
  telegram_link_failures, telegram_messages, telegram_updates
TO arandue_app;

-- Só inserção: o histórico não é alterado nem apagado pela aplicação.
GRANT SELECT, INSERT ON audit_logs, interactions, order_items, stock_movements TO arandue_app;

-- RLS ligado em toda tabela. As policies (cada empresa só vê as próprias linhas) vêm das migrações,
-- a partir da 0045: tabela nova sem policy fica fechada para a aplicação até a migração dela criar uma.
-- O teste backend/src/tests/appGrants.test.ts falha se alguma tabela ficar sem policy.
DO $$
DECLARE
  item record;
BEGIN
  FOR item IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', item.tablename);
  END LOOP;
END $$;
