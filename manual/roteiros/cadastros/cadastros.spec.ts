import { expect, test } from '@playwright/test';
import { login, OWNER, toast } from '../../../e2e/helpers.ts';
import { Scene, useRecording } from '../cena.ts';

// Roteiros dos artigos de cadastros e estoque.
useRecording();

test.beforeEach(({ page }) => login(page, OWNER));

test('manual: cadastrar um produto', async ({ page }) => {
  const scene = await Scene.open(page, 'cadastros/cadastrar-produto');
  await page.goto('/produtos');
  await expect(page.locator('tbody tr').first()).toBeVisible();

  await scene.step('cadastros/cadastrar-produto', 'Clique em Novo registro', () =>
    scene.click(page.getByRole('button', { name: 'Novo registro' })),
  );
  const form = page.getByRole('dialog', { name: 'Novo registro' });
  await scene.step('cadastros/cadastrar-produto', 'Preencha o nome, o preço e o custo', async () => {
    await scene.fill(form.locator('[name="name"]'), 'Água tônica lata 350 ml');
    await expect(form.locator('[name="type"]')).toHaveValue('product');
    await scene.fill(form.locator('[name="price"]'), '5.5');
    await scene.fill(form.locator('[name="cost"]'), '2.8');
  });
  await scene.step('cadastros/cadastrar-produto', 'Informe o estoque inicial e o mínimo', async () => {
    await scene.fill(form.locator('[name="stock"]'), '48');
    await scene.fill(form.locator('[name="minStock"]'), '12');
  });
  await scene.step('cadastros/cadastrar-produto', 'Clique em Criar registro', async () => {
    await scene.click(form.getByRole('button', { name: 'Criar registro' }));
    await expect(toast(page, 'Registro criado com sucesso.')).toBeVisible();
  });
  await scene.finish();
});

test('manual: ajustar o estoque e ver o extrato', async ({ page }) => {
  const scene = await Scene.open(page, 'cadastros/ajustar-estoque');
  await page.goto('/produtos');
  const row = page.getByRole('row', { name: /Gelo 5 kg/ });
  await expect(row).toBeVisible();

  await scene.step('cadastros/ajustar-estoque', 'Na linha do produto, clique em Estoque', () =>
    scene.click(row.getByRole('button', { name: 'Estoque' })),
  );
  const dialog = page.getByRole('dialog');
  await scene.step('cadastros/ajustar-estoque', 'Escolha Saída e informe quantidade e motivo', async () => {
    await scene.select(dialog.getByLabel('Tipo de ajuste'), 'Saída');
    await scene.fill(dialog.getByLabel(/Quantidade/), '2');
    await scene.fill(dialog.getByLabel('Motivo'), 'Pacote rasgado no freezer');
  });
  await scene.step('cadastros/ajustar-estoque', 'Clique em Ajustar estoque e veja o extrato', async () => {
    await scene.click(dialog.getByRole('button', { name: 'Ajustar estoque' }));
    await expect(toast(page, 'Estoque ajustado')).toBeVisible();
    await expect(dialog.getByRole('row').nth(1)).toContainText('Pacote rasgado no freezer');
  });
  await scene.finish();
});

test('manual: lançar e receber uma compra', async ({ page }) => {
  const scene = await Scene.open(page, 'cadastros/registrar-compra');
  await page.goto('/compras');
  await expect(page.getByRole('button', { name: 'Nova compra' })).toBeVisible();

  await scene.step('cadastros/lancar-compra', 'Clique em Nova compra', () =>
    scene.click(page.getByRole('button', { name: 'Nova compra' })),
  );
  const dialog = page.getByRole('dialog', { name: 'Nova compra' });
  await scene.step('cadastros/lancar-compra', 'Escolha o fornecedor', () =>
    scene.select(dialog.getByLabel('Fornecedor'), 'Gelo Polar'),
  );
  await scene.step('cadastros/lancar-compra', 'Escolha o produto, a quantidade e o custo', async () => {
    await scene.select(dialog.locator('select[name="items.0.productId"]'), 'Gelo 5 kg');
    await scene.fill(dialog.locator('input[name="items.0.quantity"]'), '20');
    await scene.fill(dialog.locator('input[name="items.0.unitCost"]'), '6.5');
    await expect(dialog).toContainText('Total da compra: R$ 130,00');
  });
  await scene.step('cadastros/lancar-compra', 'Clique em Salvar rascunho', async () => {
    await scene.click(dialog.getByRole('button', { name: 'Salvar rascunho' }));
    await expect(toast(page, 'Compra lançada como rascunho.')).toBeVisible();
  });

  const row = page.locator('tbody tr').first();
  await expect(row).toContainText('Rascunho');
  await scene.step('cadastros/receber-compra', 'Na compra, clique em Receber', () =>
    scene.click(row.getByRole('button', { name: 'Receber' })),
  );
  await scene.step('cadastros/receber-compra', 'Confira o resumo e clique em Receber compra', async () => {
    await scene.click(page.getByRole('dialog').getByRole('button', { name: 'Receber compra' }));
    await expect(row).toContainText('Recebida');
  });
  await scene.finish();
});

test('manual: cadastrar um fornecedor', async ({ page }) => {
  const scene = await Scene.open(page, 'cadastros/cadastrar-fornecedor');
  await page.goto('/fornecedores');
  await expect(page.locator('tbody tr').first()).toBeVisible();

  await scene.step('cadastros/cadastrar-fornecedor', 'Clique em Novo fornecedor', () =>
    scene.click(page.getByRole('button', { name: 'Novo fornecedor' })),
  );
  await scene.step(
    'cadastros/cadastrar-fornecedor',
    'Escolha Pessoa jurídica e preencha o nome',
    async () => {
      await scene.select(page.locator('select[name="kind"]:visible'), 'Pessoa jurídica');
      await scene.fill(page.locator('input[name="name"]:visible'), 'Hortifruti Vale Verde');
    },
  );
  await scene.step('cadastros/cadastrar-fornecedor', 'Preencha o telefone e o e-mail', async () => {
    await scene.fill(page.locator('input[name="phone"]:visible'), '(65) 3322-1100');
    await scene.fill(page.locator('input[name="email"]:visible'), 'pedidos@valeverde.test');
  });
  await scene.step('cadastros/cadastrar-fornecedor', 'Clique em Salvar', async () => {
    await scene.click(page.getByRole('button', { name: 'Salvar' }));
    await expect(toast(page, 'Hortifruti Vale Verde cadastrado.')).toBeVisible();
  });
  await scene.finish();
});

test('manual: cadastrar uma transportadora', async ({ page }) => {
  const scene = await Scene.open(page, 'cadastros/cadastrar-transportadora');
  await page.goto('/transportadoras');
  await expect(page.getByRole('heading', { name: 'Transportadoras', level: 2 })).toBeVisible();

  await scene.step('cadastros/cadastrar-transportadora', 'Clique em Nova transportadora', () =>
    scene.click(page.getByRole('button', { name: 'Nova transportadora' })),
  );
  await scene.step('cadastros/cadastrar-transportadora', 'Preencha o nome e o celular', async () => {
    await scene.fill(page.locator('input[name="name"]:visible'), 'Entregas Cerrado Express');
    await scene.fill(page.locator('input[name="mobile"]:visible'), '(65) 97777-2020');
  });
  await scene.step('cadastros/cadastrar-transportadora', 'Clique em Salvar', async () => {
    await scene.click(page.getByRole('button', { name: 'Salvar' }));
    await expect(toast(page, 'Entregas Cerrado Express cadastrado.')).toBeVisible();
  });
  await scene.finish();
});
