-- Valor pago até o valor do título; etapa a partir de 0; entrada entre 0 e 100%; meta no dia 1 do mês.
-- Equivalente às validações do código (packages/shared/src/schemas). Para voltar:
-- ALTER TABLE "expenses" DROP CONSTRAINT "expenses_paid_ate_amount";
-- ALTER TABLE "payment_conditions" DROP CONSTRAINT "payment_conditions_down_payment_percent_faixa";
-- ALTER TABLE "pipeline_stages" DROP CONSTRAINT "pipeline_stages_position_nao_negativa";
-- ALTER TABLE "receivables" DROP CONSTRAINT "receivables_paid_ate_amount";
-- ALTER TABLE "sales_goals" DROP CONSTRAINT "sales_goals_month_dia_1";

ALTER TABLE "expenses" ADD CONSTRAINT "expenses_paid_ate_amount" CHECK ("expenses"."paid_amount" <= "expenses"."amount");--> statement-breakpoint
ALTER TABLE "payment_conditions" ADD CONSTRAINT "payment_conditions_down_payment_percent_faixa" CHECK ("payment_conditions"."down_payment_percent" BETWEEN 0 AND 100);--> statement-breakpoint
ALTER TABLE "pipeline_stages" ADD CONSTRAINT "pipeline_stages_position_nao_negativa" CHECK ("pipeline_stages"."position" >= 0);--> statement-breakpoint
ALTER TABLE "receivables" ADD CONSTRAINT "receivables_paid_ate_amount" CHECK ("receivables"."paid_amount" <= "receivables"."amount");--> statement-breakpoint
ALTER TABLE "sales_goals" ADD CONSTRAINT "sales_goals_month_dia_1" CHECK (extract(day from "sales_goals"."month") = 1);