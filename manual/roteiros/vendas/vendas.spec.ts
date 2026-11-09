import { expect, test } from '@playwright/test';
import {
  CUSTOMER,
  createQuote,
  login,
  OWNER,
  STOCK_PRODUCT,
  sendQuote,
  toast,
} from '../../../e2e/helpers.ts';
import { Scene, useRecording } from '../cena.ts';

// Roteiros dos artigos de vendas, fora o piloto (criar-e-enviar-orcamento.spec.ts).
useRecording();

test.beforeEach(({ page }) => login(page, OWNER));

test('manual: cadastrar um cliente', async ({ page }) => {
  const scene = await Scene.open(page, 'vendas/cadastrar-cliente');
  await page.goto('/clientes');
  await expect(page.locator('tbody tr').first()).toBeVisible();

  await scene.step('vendas/cadastrar-cliente', 'Clique em Novo cliente', () =>
    scene.click(page.getByRole('button', { name: 'Novo cliente' })),
  );
  await scene.step('vendas/cadastrar-cliente', 'Preencha o nome e o celular', async () => {
    await scene.fill(page.locator('input[name="name"]:visible'), 'Mercadinho Boa Vista');
    await scene.fill(page.locator('input[name="mobile"]:visible'), '(65) 99999-1234');
  });
  await scene.step('vendas/cadastrar-cliente', 'Clique em Salvar', async () => {
    await scene.click(page.getByRole('button', { name: 'Salvar' }));
    await expect(toast(page, 'Mercadinho Boa Vista cadastrado.')).toBeVisible();
  });
  await scene.finish();
});

test('manual: aprovar e converter um orçamento em pedido', async ({ page }) => {
  const scene = await Scene.open(page, 'vendas/aprovar-e-converter-orcamento');
  // Preparação fora do vídeo: um orçamento já enviado.
  await createQuote(page);
  await sendQuote(page);
  const menu = page.getByRole('button', { name: /^Ações:/ });

  await scene.step('vendas/aprovar-converter', 'No menu ⋯, escolha Aprovar', async () => {
    await scene.click(menu);
    await scene.click(page.getByRole('menuitem', { name: 'Aprovar', exact: true }));
    await expect(page.getByRole('heading', { name: /Orçamento #\d+ Aprovado/ })).toBeVisible();
  });
  await scene.step('vendas/aprovar-converter', 'Escolha Converter em pedido', async () => {
    await scene.click(menu);
    await scene.click(page.getByRole('menuitem', { name: 'Converter em pedido', exact: true }));
  });
  const dialog = page.getByRole('dialog', { name: /Converter orçamento/ });
  await scene.step('vendas/aprovar-converter', 'Confira a data e o status e crie o pedido', async () => {
    await expect(dialog.getByLabel('Data da venda')).toBeVisible();
    await scene.click(dialog.getByRole('button', { name: 'Criar pedido' }));
    await expect(page.getByRole('heading', { name: /Pedido #\d+/ })).toBeVisible();
  });
  await scene.finish();
});

test('manual: criar um pedido de venda', async ({ page }) => {
  const scene = await Scene.open(page, 'vendas/criar-pedido');
  await page.goto('/pedidos');
  await expect(page.locator('tbody tr').first()).toBeVisible();

  await scene.step('vendas/criar-pedido', 'Clique em Novo pedido', () =>
    scene.click(page.getByRole('button', { name: 'Novo pedido' })),
  );
  await scene.step('vendas/criar-pedido', 'Escolha o cliente, o item e a quantidade', async () => {
    await scene.select(page.locator('select[name="customerId"]:visible'), CUSTOMER);
    await scene.select(page.locator('select[name="items.0.productId"]:visible'), STOCK_PRODUCT);
    await scene.fill(page.locator('input[name="items.0.quantity"]:visible'), '6');
  });
  await scene.step('vendas/criar-pedido', 'Escolha o status e clique em Criar pedido', async () => {
    await scene.select(page.locator('select[name="status"]:visible'), 'Pendente (a receber)');
    await scene.click(page.getByRole('button', { name: 'Criar pedido' }));
    await expect(page.getByRole('heading', { name: /Pedido #\d+/ })).toBeVisible();
  });
  await scene.finish();
});

test('manual: cadastro rápido no orçamento e no pedido', async ({ page }) => {
  const scene = await Scene.open(page, 'vendas/cadastro-rapido');
  await page.goto('/orcamentos/novo');
  await expect(page.locator('select[name="items.0.productId"]:visible')).toBeVisible();
  await page.locator('select[name="items.0.productId"]:visible').selectOption({ index: 1 });

  await scene.step('vendas/cadastro-rapido-cliente', 'Clique em Novo cliente', () =>
    scene.click(page.getByRole('button', { name: 'Novo cliente' })),
  );
  const dialog = page.getByRole('dialog', { name: 'Novo cliente' });
  await scene.step('vendas/cadastro-rapido-cliente', 'Preencha o nome e o celular', async () => {
    await scene.fill(dialog.getByLabel('Nome'), 'Lanchonete do Porto');
    await scene.fill(dialog.getByLabel('Celular'), '(65) 98888-4321');
  });
  await scene.step('vendas/cadastro-rapido-cliente', 'Clique em Cadastrar cliente', async () => {
    await scene.click(dialog.getByRole('button', { name: 'Cadastrar cliente' }));
    await expect(page.locator('select[name="customerId"]:visible').locator('option:checked')).toHaveText(
      'Lanchonete do Porto',
    );
  });
  await scene.finish();
});

test('manual: receber um pagamento', async ({ page }) => {
  const scene = await Scene.open(page, 'vendas/receber-pagamento');
  await page.goto('/contas-a-receber');
  const settle = page.getByRole('button', { name: /^Dar baixa: / }).first();
  await expect(settle).toBeVisible();

  await scene.step('vendas/receber-pagamento', 'Na conta paga, clique em Dar baixa', () =>
    scene.click(settle),
  );
  const dialog = page.getByRole('dialog');
  await scene.step('vendas/receber-pagamento', 'Confira a data, a conta e o valor', async () => {
    await expect(dialog.getByLabel('Data do recebimento')).toBeVisible();
    await scene.click(dialog.getByLabel('Conta de recebimento'));
  });
  await scene.step('vendas/receber-pagamento', 'Clique em Confirmar recebimento', async () => {
    await scene.click(dialog.getByRole('button', { name: 'Confirmar recebimento' }));
    await expect(toast(page, 'registrada no caixa')).toBeVisible();
  });
  await scene.finish();
});
