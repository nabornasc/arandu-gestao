import { expect, test } from '@playwright/test';
import { CUSTOMER, login, OWNER, toast } from '../../../e2e/helpers.ts';
import { Scene, useRecording } from '../cena.ts';

// Roteiros dos artigos de gestão.
useRecording();

test.beforeEach(({ page }) => login(page, OWNER));

test('manual: acompanhar uma oportunidade no CRM', async ({ page }) => {
  const scene = await Scene.open(page, 'gestao/crm-oportunidade');
  await page.goto('/crm');
  await expect(page.getByRole('heading', { name: 'Funil de vendas' })).toBeVisible();

  await scene.step('gestao/crm-oportunidade', 'Clique em Nova oportunidade', () =>
    scene.click(page.locator('.page-heading').getByRole('button', { name: 'Nova oportunidade' })),
  );
  await scene.step('gestao/crm-oportunidade', 'Preencha título, cliente e origem', async () => {
    await scene.fill(page.locator('input[name="title"]:visible'), 'Festa de aniversário');
    await scene.select(page.locator('select[name="customerId"]:visible'), CUSTOMER);
    await scene.fill(page.locator('input[name="source"]:visible'), 'Indicação');
  });
  await scene.step('gestao/crm-oportunidade', 'Informe o valor e a próxima ação', async () => {
    await scene.fill(page.locator('input[name="estimatedValue"]:visible'), '1200');
    await scene.fill(page.locator('input[name="nextAction"]:visible'), 'Ligar amanhã');
  });
  await scene.step('gestao/crm-oportunidade', 'Clique em Salvar', async () => {
    await scene.click(page.getByRole('button', { name: 'Salvar' }));
    await expect(toast(page, 'Oportunidade Festa de aniversário cadastrada.')).toBeVisible();
  });
  const stages = page.getByRole('list', { name: 'Etapas do funil' });
  await scene.step('gestao/crm-etapa', 'Clique na próxima etapa do funil', async () => {
    await scene.click(stages.getByRole('button', { name: 'Em contato' }));
    await expect(stages.locator('[aria-current="step"]')).toHaveText('Em contato');
  });
  await scene.finish();
});

test('manual: organizar a agenda', async ({ page }) => {
  const scene = await Scene.open(page, 'gestao/agenda');
  await page.goto('/agenda');
  await expect(page.getByRole('button', { name: 'Nova tarefa' })).toBeVisible();

  await scene.step('gestao/agenda', 'Clique em Nova tarefa', () =>
    scene.click(page.getByRole('button', { name: 'Nova tarefa' })),
  );
  const dialog = page.getByRole('dialog');
  await scene.step('gestao/agenda', 'Preencha o título e a hora', async () => {
    await scene.fill(dialog.getByLabel('Título'), 'Conferir o estoque de gelo');
    await scene.fill(dialog.getByLabel('Hora (opcional)'), '16:00');
  });
  await scene.step('gestao/agenda', 'Clique em Salvar', async () => {
    await scene.click(dialog.getByRole('button', { name: 'Salvar' }));
    await expect(toast(page, 'Tarefa criada')).toBeVisible();
  });
  const task = page.getByRole('button', { name: /16:00 Conferir o estoque de gelo/ });
  await scene.step('gestao/agenda', 'Ao terminar, marque Concluída e salve', async () => {
    await scene.click(task);
    await scene.click(page.getByRole('dialog').getByLabel('Concluída'));
    await scene.click(page.getByRole('dialog').getByRole('button', { name: 'Salvar' }));
    await expect(task).toHaveClass(/done/);
  });
  await scene.finish();
});

test('manual: ver relatórios e exportar em CSV', async ({ page }) => {
  const scene = await Scene.open(page, 'gestao/relatorios');
  await page.goto('/relatorios');
  const catalog = page.getByRole('navigation', { name: 'Relatórios disponíveis' });
  await expect(catalog).toBeVisible();

  await scene.step('gestao/relatorios', 'Busque e abra o relatório', async () => {
    await scene.fill(catalog.getByLabel('Buscar relatório'), 'pedidos');
    await scene.click(catalog.getByRole('button', { name: 'Pedidos emitidos', exact: true }));
  });
  await scene.step('gestao/relatorios', 'Escolha o período', async () => {
    await scene.select(page.getByLabel(/^Período/), 'Todos');
    await expect(page.getByRole('table', { name: 'Pedidos emitidos' }).locator('tfoot')).toContainText(
      'Total',
    );
  });
  await scene.step('gestao/relatorios', 'Clique em Exportar CSV', async () => {
    const download = page.waitForEvent('download');
    await scene.click(page.getByRole('link', { name: 'Exportar CSV' }));
    expect((await download).suggestedFilename()).toMatch(/\.csv$/);
  });
  await scene.finish();
});

test('manual: definir e acompanhar metas de venda', async ({ page }) => {
  const scene = await Scene.open(page, 'gestao/metas');
  await page.goto('/metas');
  const form = page.getByRole('form', { name: 'Definir metas' });
  await expect(form).toBeVisible();

  await scene.step('gestao/metas', 'Preencha a meta da empresa e dos vendedores', async () => {
    await scene.fill(form.getByLabel('Empresa'), '80000');
    await scene.fill(form.getByRole('spinbutton').nth(1), '30000');
  });
  await scene.step('gestao/metas', 'Clique em Salvar metas e veja o andamento', async () => {
    await scene.click(form.getByRole('button', { name: 'Salvar metas' }));
    await expect(toast(page, 'Metas salvas.')).toBeVisible();
    await expect(page.getByRole('region', { name: 'Andamento' })).toContainText('de R$ 80.000,00');
  });
  await scene.finish();
});

test('manual: calcular o preço de venda', async ({ page }) => {
  const scene = await Scene.open(page, 'gestao/precificacao');
  await page.goto('/precificacao');
  await expect(page.getByLabel('Produto (opcional)')).toBeVisible();

  await scene.step('gestao/precificacao', 'Escolha o produto e confira o custo', () =>
    scene.select(page.getByLabel('Produto (opcional)'), 'Energético 250 ml'),
  );
  await scene.step('gestao/precificacao', 'Informe os custos da venda e a margem', async () => {
    await scene.fill(page.getByLabel('Custos da venda (% do preço)'), '12');
    await scene.fill(page.getByLabel('Margem de lucro desejada (%)'), '25');
  });
  const result = page.getByRole('region', { name: 'Resultado' });
  await scene.step('gestao/precificacao', 'Clique em Aplicar para gravar o preço', async () => {
    await scene.click(result.getByRole('button', { name: /^Aplicar R\$/ }));
    await expect(toast(page, 'Preço do produto atualizado.')).toBeVisible();
  });
  await scene.finish();
});

test('manual: consultar a auditoria', async ({ page }) => {
  const scene = await Scene.open(page, 'gestao/auditoria');
  // Preparação fora do vídeo: uma alteração de preço para procurar.
  await page.goto('/produtos');
  await page
    .getByRole('row', { name: /Montagem de bar para eventos/ })
    .getByRole('button', { name: 'Editar' })
    .click();
  await page.getByRole('dialog').getByLabel('Preço').fill('290');
  await page.getByRole('dialog').getByRole('button', { name: 'Salvar alterações' }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  await page.goto('/auditoria');
  const filters = page.getByRole('form', { name: 'Filtros da auditoria' });
  await expect(filters).toBeVisible();

  await scene.step('gestao/auditoria', 'Filtre o módulo e a ação', async () => {
    await scene.select(filters.getByLabel('Módulo'), 'Produtos e serviços');
    await scene.select(filters.getByLabel('Ação'), 'Alterou');
  });
  const line = page.getByRole('row', { name: /Montagem de bar para eventos/ }).first();
  await scene.step('gestao/auditoria', 'Clique na ação para ver o detalhe', async () => {
    await scene.click(line.getByRole('link', { name: 'Alterou preço' }));
    await expect(page).toHaveURL(/\/historico\/\d+$/);
  });
  await scene.step('gestao/auditoria', 'Veja o valor de antes e o de depois', async () => {
    await expect(page.getByRole('row', { name: /Preço\s+R\$/ }).first()).toBeVisible();
  });
  await scene.finish();
});
