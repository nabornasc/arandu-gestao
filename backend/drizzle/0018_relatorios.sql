-- Todo grupo pode abrir a tela de relatórios: cada relatório continua exigindo a leitura do seu módulo.
INSERT INTO "access_group_permissions" ("group_id", "permission")
SELECT "id", 'reports.read' FROM "access_groups" WHERE NOT "is_owner"
ON CONFLICT DO NOTHING;--> statement-breakpoint
-- Exportar em CSV fica com quem já vê os indicadores (o Proprietário tem tudo por definição).
INSERT INTO "access_group_permissions" ("group_id", "permission")
SELECT "group_id", 'reports.export' FROM "access_group_permissions" WHERE "permission" = 'analytics.read'
ON CONFLICT DO NOTHING;
