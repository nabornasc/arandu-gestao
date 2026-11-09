import { expect, test } from '@playwright/test';
import { login, OWNER, toast } from '../../../e2e/helpers.ts';
import { Scene, useRecording } from '../cena.ts';

// Roteiros dos artigos de docs/manual/inicio.
useRecording();

test.beforeEach(({ page }) => login(page, OWNER));

test('manual: configurar a empresa e o limite do MEI', async ({ page }) => {
  const scene = await Scene.open(page, 'inicio/configurar-empresa');
  await page.goto('/configuracoes');
  const limit = page.getByLabel('Limite anual do MEI (R$) *');
  await expect(limit).toBeVisible();

  await scene.step('inicio/configurar-limite', 'Informe o limite anual do MEI', () =>
    scene.fill(limit, '81000'),
  );
  await scene.step('inicio/configurar-limite', 'Clique em Salvar configurações', async () => {
    await scene.click(page.getByRole('button', { name: 'Salvar configurações' }));
    await expect(toast(page, 'Configurações salvas.')).toBeVisible();
  });
  await scene.finish();
});

test('manual: convidar usuários', async ({ page }) => {
  const scene = await Scene.open(page, 'inicio/convidar-usuarios');
  await page.goto('/usuarios');
  await expect(page.getByRole('heading', { name: 'Usuários', level: 2 })).toBeVisible();

  await scene.step('inicio/convidar-usuario', 'Clique em Convidar usuário', () =>
    scene.click(page.getByRole('button', { name: 'Convidar usuário' })),
  );
  const dialog = page.getByRole('dialog', { name: 'Convidar usuário' });
  await scene.step('inicio/convidar-usuario', 'Preencha nome e e-mail', async () => {
    await scene.fill(dialog.getByLabel('Nome'), 'Paula Lima');
    await scene.fill(dialog.getByLabel('E-mail (login)'), 'paula@conveniencia.test');
  });
  await scene.step('inicio/convidar-usuario', 'Escolha o grupo e a senha inicial', async () => {
    await scene.select(dialog.getByLabel('Grupo de acesso'), 'Vendedor');
    await scene.fill(dialog.getByLabel('Senha inicial'), 'senha-inicial-123');
  });
  await scene.step('inicio/convidar-usuario', 'Clique em Convidar', async () => {
    await scene.click(dialog.getByRole('button', { name: 'Convidar', exact: true }));
    await expect(toast(page, 'Usuário convidado.')).toBeVisible();
  });
  await scene.finish();
});

test('manual: acompanhar a visão geral', async ({ page }) => {
  const scene = await Scene.open(page, 'inicio/visao-geral');
  await page.goto('/');
  await expect(page.getByRole('region', { name: 'Vendas por mês' })).toBeVisible();

  await scene.step('inicio/personalizar-visao-geral', 'Clique em Personalizar', () =>
    scene.click(page.getByRole('button', { name: 'Personalizar' })),
  );
  await scene.step('inicio/personalizar-visao-geral', 'Mude a ordem ou o tamanho dos blocos', async () => {
    await scene.click(page.getByRole('button', { name: 'Mover Saldo atual para antes' }));
  });
  await scene.step('inicio/personalizar-visao-geral', 'Clique em Salvar', async () => {
    await scene.click(page.getByRole('button', { name: 'Salvar', exact: true }));
    await expect(toast(page, 'Visão geral salva.')).toBeVisible();
  });
  // Deixa a visão geral como estava para os outros testes.
  await page.getByRole('button', { name: 'Personalizar' }).click();
  await page.getByRole('button', { name: 'Restaurar padrão' }).click();
  await scene.finish();
});

test('manual: buscar e usar atalhos', async ({ page }) => {
  const scene = await Scene.open(page, 'inicio/busca-e-atalhos');
  await page.goto('/');
  await expect(page.getByRole('button', { name: /^Buscar/ })).toBeVisible();

  await scene.step('inicio/busca-rapida', 'Aperte Ctrl+K', async () => {
    await page.keyboard.press('Control+k');
    await expect(page.getByRole('dialog', { name: 'Buscar' })).toBeVisible();
  });
  const dialog = page.getByRole('dialog', { name: 'Buscar' });
  await scene.step('inicio/busca-rapida', 'Digite parte do nome', async () => {
    await scene.fill(dialog.getByRole('searchbox').or(dialog.getByRole('textbox')), 'Ana');
    await expect(dialog.getByRole('list', { name: 'Resultados' }).getByRole('button').first()).toBeVisible();
  });
  await scene.step('inicio/busca-rapida', 'Aperte Enter para abrir', async () => {
    await page.keyboard.press('Enter');
    await expect(dialog).toBeHidden();
  });
  await scene.finish();
});
