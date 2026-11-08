import { expect, test } from '@playwright/test';
import { login, OWNER, toast } from './helpers.ts';

test('agenda mostra tarefas e prazos; cria, conclui e troca de visão', async ({ page }) => {
  await login(page, OWNER);
  await page.getByRole('link', { name: 'Agenda', exact: true }).click();

  // Semana atual: a tarefa do seed de hoje e um prazo vindo do CRM ou do financeiro.
  await expect(page.getByRole('button', { name: /09:00 Receber a Distribuidora Rio Claro/ })).toBeVisible();

  await page.getByRole('button', { name: 'Nova tarefa' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Título').fill('Ligar para o fornecedor de gelo');
  await dialog.getByLabel('Hora (opcional)').fill('14:30');
  await dialog.getByRole('button', { name: 'Salvar' }).click();
  await expect(toast(page, 'Tarefa criada')).toBeVisible();

  const task = page.getByRole('button', { name: /14:30 Ligar para o fornecedor de gelo/ });
  await task.click();
  await page.getByRole('dialog').getByLabel('Concluída').check();
  await page.getByRole('dialog').getByRole('button', { name: 'Salvar' }).click();
  await expect(toast(page, 'Tarefa atualizada')).toBeVisible();
  await expect(task).toHaveClass(/done/);

  // Esconder as tarefas tira o item da tela; o filtro fica lembrado.
  await page.getByLabel('Tarefas').uncheck();
  await expect(task).toHaveCount(0);
  await page.getByLabel('Tarefas').check();

  await page.getByRole('button', { name: 'Mês', exact: true }).click();
  await expect(page.getByRole('button', { name: /Ligar para o fornecedor de gelo/ })).toBeVisible();
  await page.getByRole('button', { name: 'Lista', exact: true }).click();
  await expect(page.getByRole('button', { name: /Ligar para o fornecedor de gelo/ })).toBeVisible();
});
