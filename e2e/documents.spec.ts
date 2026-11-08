import { expect, test } from '@playwright/test';
import {
  CUSTOMER,
  chooseOption,
  createQuote,
  itemSelect,
  login,
  OWNER,
  openMenuItem,
  SERVICE,
} from './helpers.ts';

test.beforeEach(({ page }) => login(page, OWNER));

const addDays = (days: number) => {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000 + days * 86_400_000);
  return local.toISOString().slice(0, 10);
};

test('validade em dias e data andam juntas', async ({ page }) => {
  await page.goto('/orcamentos/novo');
  await page.getByLabel('Validade (dias)').fill('15');
  await expect(page.getByLabel('Válido até')).toHaveValue(addDays(15));
  await page.getByLabel('Válido até').fill(addDays(7));
  await expect(page.getByLabel('Validade (dias)')).toHaveValue('7');
});

test('desconto em %: recalcula com os itens e é salvo em R$', async ({ page }) => {
  await page.goto('/orcamentos/novo');
  await chooseOption(page.getByLabel('Cliente'), CUSTOMER);
  await chooseOption(itemSelect(page, 0), SERVICE);
  await page.locator('input[name="items.0.unitPrice"]:visible').fill('100');
  await page.locator('input[name="items.0.quantity"]:visible').fill('2');
  await page.getByLabel('Tipo de desconto').selectOption('percent');
  await page.getByLabel('Desconto (%)').fill('10');
  await expect(page.getByText('= R$ 20,00')).toBeVisible();
  // Mais itens: o desconto em % acompanha o subtotal.
  await page.locator('input[name="items.0.quantity"]:visible').fill('3');
  await expect(page.getByText('= R$ 30,00')).toBeVisible();

  await page.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(page).toHaveURL(/\/orcamentos\/\d+$/);
  await expect(page.getByLabel('Desconto (R$)')).toHaveValue('30');
});

test('item oculto entra no total, mas não sai no espelho do cliente; grupo duplica', async ({ page }) => {
  await page.goto('/orcamentos/novo');
  await chooseOption(page.getByLabel('Cliente'), CUSTOMER);
  await chooseOption(itemSelect(page, 0), SERVICE);
  await page.locator('input[name="items.0.unitPrice"]:visible').fill('100');
  await page.locator('input[name="items.0.groupName"]:visible').fill('Bar');
  await page.getByRole('button', { name: 'Adicionar item' }).click();
  await chooseOption(itemSelect(page, 1), SERVICE);
  await page.locator('input[name="items.1.unitPrice"]:visible').fill('40');
  await page.locator('input[name="items.1.groupName"]:visible').fill('Bar');
  await page.locator('input[name="items.1.hiddenInMirror"]:visible').check();

  await page.getByRole('button', { name: 'Duplicar grupo Bar' }).click();
  await expect(page.locator('input[name="items.2.groupName"]:visible')).toHaveValue('Bar (cópia)');
  await expect(page.locator('input[name="items.3.hiddenInMirror"]:visible')).toBeChecked();
  await page.getByRole('button', { name: 'Remover item 4' }).click();
  await page.getByRole('button', { name: 'Remover item 3' }).click();

  await page.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(page).toHaveURL(/\/orcamentos\/\d+$/);

  const popup = page.waitForEvent('popup');
  await openMenuItem(page, 'Espelho do cliente');
  const mirror = await popup;
  // Só a linha visível sai; subtotal do grupo e total contam as duas.
  await expect(mirror.locator('table.mirror-items tbody tr').filter({ hasText: SERVICE })).toHaveCount(1);
  await expect(mirror.getByText('Subtotal de Bar')).toBeVisible();
  await expect(mirror.locator('tr.mirror-group-total')).toContainText('R$ 140,00');
});

test('condição de pagamento: cadastrada nas configurações, gera parcelas com formas diferentes', async ({
  page,
}) => {
  const name = `Entrada 20% + 30/60 ${Date.now().toString().slice(-5)}`;
  await page.goto('/configuracoes');
  const section = page.getByRole('region', { name: 'Condições de pagamento' });
  await section.getByRole('button', { name: 'Nova condição' }).click();
  const dialog = page.getByRole('dialog', { name: 'Nova condição' });
  await dialog.getByLabel('Nome').fill(name);
  await dialog.getByLabel('Entrada (%)').fill('20');
  await dialog.getByLabel('Forma da entrada').fill('PIX');
  await dialog.getByLabel('Prazos em dias').fill('30/60');
  await dialog.getByLabel('Forma das parcelas').fill('Boleto');
  await dialog.getByRole('button', { name: 'Salvar condição' }).click();
  await expect(dialog).toBeHidden();
  await expect(section.getByRole('row').filter({ hasText: name })).toContainText(
    'Entrada 20% (PIX) + 30/60 dias (Boleto)',
  );

  await page.goto('/orcamentos/novo');
  await chooseOption(page.locator('select[name="customerId"]:visible'), CUSTOMER);
  await chooseOption(itemSelect(page, 0), SERVICE);
  await page.locator('input[name="items.0.unitPrice"]:visible').fill('100');
  await page.getByText('Parcelas', { exact: true }).click();
  await chooseOption(page.getByLabel('Condição de pagamento'), name);
  await expect(page.locator('input[name="installments.0.amount"]:visible')).toHaveValue('20');
  await expect(page.locator('input[name="installments.0.method"]:visible')).toHaveValue('PIX');
  await expect(page.locator('input[name="installments.0.dueDate"]:visible')).toHaveValue(addDays(0));
  await expect(page.locator('input[name="installments.1.amount"]:visible')).toHaveValue('40');
  await expect(page.locator('input[name="installments.2.method"]:visible')).toHaveValue('Boleto');
  await expect(page.locator('input[name="installments.2.dueDate"]:visible')).toHaveValue(addDays(60));

  await page.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(page).toHaveURL(/\/orcamentos\/\d+$/);
  await expect(page.locator('input[name="installments.1.method"]:visible')).toHaveValue('Boleto');
});

test('biblioteca: texto vira cláusula no espelho; grupo salvo como modelo entra em outro orçamento', async ({
  page,
}) => {
  const tag = Date.now().toString().slice(-5);
  await page.goto('/configuracoes');
  const library = page.getByRole('region', { name: 'Biblioteca do orçamento' });
  await library.getByRole('button', { name: 'Novo texto' }).click();
  const dialog = page.getByRole('dialog', { name: 'Novo texto' });
  await dialog.getByLabel('Título').fill(`Garantia ${tag}`);
  await dialog.getByLabel('Texto').fill(`Garantia de 90 dias para a montagem ${tag}.`);
  await dialog.getByRole('button', { name: 'Salvar texto' }).click();
  await expect(dialog).toBeHidden();

  await page.goto('/orcamentos/novo');
  await chooseOption(page.locator('select[name="customerId"]:visible'), CUSTOMER);
  await chooseOption(itemSelect(page, 0), SERVICE);
  await page.locator('input[name="items.0.groupName"]:visible').fill(`Kit ${tag}`);
  await page.getByText('Cláusulas e condições', { exact: true }).click();
  await chooseOption(page.getByLabel('Inserir texto da biblioteca'), `Garantia ${tag}`);
  await expect(page.getByLabel('Cláusulas deste orçamento')).toHaveValue(
    `Garantia de 90 dias para a montagem ${tag}.`,
  );
  await page.getByRole('button', { name: `Criar modelo do grupo Kit ${tag}` }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Modelo salvo.' })).toBeVisible();
  await page.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(page).toHaveURL(/\/orcamentos\/\d+$/);

  const popup = page.waitForEvent('popup');
  await openMenuItem(page, 'Espelho do cliente');
  const mirror = await popup;
  await expect(mirror.getByText(`Garantia de 90 dias para a montagem ${tag}.`)).toBeVisible();
  await mirror.close();

  await page.goto('/orcamentos/novo');
  await page.getByLabel('Modelo de grupo').fill(`Kit ${tag}`);
  await page.getByRole('button', { name: 'Inserir modelo' }).click();
  await expect(itemSelect(page, 0).locator('option:checked')).toContainText(SERVICE);
  await expect(page.locator('input[name="items.0.groupName"]:visible')).toHaveValue(`Kit ${tag}`);
});

test('item avulso entra no pedido com descrição e preço livres', async ({ page }) => {
  const tag = Date.now().toString().slice(-5);
  await page.goto('/pedidos/novo');
  await chooseOption(page.getByLabel('Cliente'), CUSTOMER);
  await itemSelect(page, 0).selectOption('avulso');
  await page.locator('input[name="items.0.description"]:visible').fill(`Taxa de entrega ${tag}`);
  await page.locator('input[name="items.0.unitPrice"]:visible').fill('15');
  await page.getByRole('button', { name: 'Criar pedido' }).click();
  await expect(page).toHaveURL(/\/pedidos\/\d+$/);
  await expect(page.getByRole('cell', { name: new RegExp(`Taxa de entrega ${tag}`) })).toBeVisible();
});

test('orçamento baixa em Word (DOCX) pelo menu de ações', async ({ page }) => {
  await createQuote(page);
  const download = page.waitForEvent('download');
  await openMenuItem(page, 'Baixar em Word (DOCX)');
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^orcamento-\d{3,}\.docx$/);
  const stream = await file.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);
  // Arquivo do Office é um zip: começa com "PK".
  expect(Buffer.concat(chunks).subarray(0, 2).toString()).toBe('PK');
});
