import { expect, test } from '@playwright/test';
import { login, OWNER, toast } from '../../../e2e/helpers.ts';
import { Scene, useRecording } from '../cena.ts';

// Roteiros dos artigos de administração.
useRecording();

test.beforeEach(({ page }) => login(page, OWNER));

test('manual: gerenciar grupos de acesso', async ({ page }) => {
  const scene = await Scene.open(page, 'administracao/grupos-de-acesso');
  await page.goto('/grupos');
  await expect(page.getByRole('button', { name: 'Novo grupo' })).toBeVisible();

  await scene.step('administracao/grupos-de-acesso', 'Clique em Novo grupo', () =>
    scene.click(page.getByRole('button', { name: 'Novo grupo' })),
  );
  const dialog = page.getByRole('dialog', { name: 'Novo grupo de acesso' });
  await scene.step('administracao/grupos-de-acesso', 'Preencha o nome e a descrição', async () => {
    await scene.fill(dialog.getByLabel('Nome do grupo'), 'Caixa da loja');
    await scene.fill(dialog.getByLabel('Descrição', { exact: true }), 'Recebe pagamentos no balcão');
  });
  await scene.step('administracao/grupos-de-acesso', 'Marque as permissões do grupo', async () => {
    await scene.click(dialog.getByLabel('Todas as permissões de Contas a receber'));
    await expect(dialog.locator('input[name="receivables.settle"]')).toBeChecked();
  });
  await scene.step('administracao/grupos-de-acesso', 'Clique em Criar grupo', async () => {
    await scene.click(dialog.getByRole('button', { name: 'Criar grupo' }));
    await expect(toast(page, 'Grupo criado.')).toBeVisible();
    await expect(page.getByRole('row', { name: /Caixa da loja/ })).toBeVisible();
  });
  await scene.finish();
});

test('manual: personalizar as listas da empresa', async ({ page }) => {
  const scene = await Scene.open(page, 'administracao/listas-da-empresa');
  await page.goto('/configuracoes');
  const lists = page.getByRole('region', { name: 'Listas' });
  await lists.scrollIntoViewIfNeeded();

  await scene.step('administracao/listas-da-empresa', 'Escolha a lista', () =>
    scene.select(lists.getByLabel('Lista'), 'Categorias financeiras'),
  );
  await scene.step(
    'administracao/listas-da-empresa',
    'Digite o novo valor e clique em Adicionar',
    async () => {
      await scene.fill(lists.getByLabel('Novo valor'), 'Manutenção do freezer');
      await scene.click(lists.getByRole('button', { name: 'Adicionar' }));
      await expect(toast(page, 'Valor adicionado')).toBeVisible();
      await expect(lists.getByLabel('Nome: Manutenção do freezer')).toBeVisible();
    },
  );
  await scene.finish();
});
