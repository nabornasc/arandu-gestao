-- CPF/CNPJ só com dígitos (11 ou 14), CEP só com dígitos (até 8) e código de vínculo do Telegram único.
-- Equivalente às validações do código (packages/shared/src/schemas). Para voltar:
-- ALTER TABLE "people" DROP CONSTRAINT "people_document_digitos";
-- ALTER TABLE "people" DROP CONSTRAINT "people_zip_digitos";
-- ALTER TABLE "person_addresses" DROP CONSTRAINT "person_addresses_zip_digitos";
-- DROP INDEX "users_telegram_link_code_unique";
-- CREATE INDEX "users_telegram_link_code_index" ON "users" USING btree ("telegram_link_code");

DROP INDEX "users_telegram_link_code_index";--> statement-breakpoint
CREATE UNIQUE INDEX "users_telegram_link_code_unique" ON "users" USING btree ("telegram_link_code");--> statement-breakpoint
ALTER TABLE "people" ADD CONSTRAINT "people_document_digitos" CHECK ("people"."document" ~ '^([0-9]{11}|[0-9]{14})$');--> statement-breakpoint
ALTER TABLE "people" ADD CONSTRAINT "people_zip_digitos" CHECK ("people"."zip" ~ '^[0-9]{1,8}$');--> statement-breakpoint
ALTER TABLE "person_addresses" ADD CONSTRAINT "person_addresses_zip_digitos" CHECK ("person_addresses"."zip" ~ '^[0-9]{1,8}$');