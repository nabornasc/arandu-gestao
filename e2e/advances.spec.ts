import { expect, test } from '@playwright/test';
import { CUSTOMER, createOrder, login, OWNER, toast } from './helpers.ts';

test('adiantamento: registrado na ficha do cliente e usado na baixa, sem nova entrada no caixa', async ({
  page,
}) => {
  await login(page, OWNER);
  const people = (await (await page.request.get('/api/people?role=customer')).json()) as {
    id: number;
    name: string;
  }[];
  const customerId = people.find((row) => row.name === CUSTOMER)?.id;
  expect(customerId).toBeTruthy();
  const accounts = (await (await page.request.get('/api/bank-accounts/options')).json()) as { id: number }[];

  await page.goto(`/clientes/${customerId}/ficha`);
  await page.getByRole('tab', { name: 'Adiantamentos' }).click();
  const before = Number(
    ((await (await page.request.get(`/api/customers/${customerId}/advances`)).json()) as { balance: number })
      .balance,
  );
  await page.getByRole('button', { name: 'Registrar adiantamento' }).click();
  const dialog = page.getByRole('dialog', { name: `Adiantamento de ${CUSTOMER}` });
  await dialog.getByLabel('Valor (R$)').fill('500');
  await dialog.getByLabel('Conta em que entrou').selectOption(String(accounts[0]?.id));
  await dialog.getByRole('button', { name: 'Registrar adiantamento' }).click();
  await expect(toast(page, 'Adiantamento registrado.')).toBeVisible();

  const path = await createOrder(page);
  const code =
    (await page.getByRole('heading', { name: /Pedido #\d+/ }).textContent())?.match(/#\d+/)?.[0] ?? '';
  expect(path).toMatch(/\/pedidos\/\d+$/);
  const cashBefore = ((await (await page.request.get('/api/dashboard')).json()) as { balance: number })
    .balance;

  await page.goto('/contas-a-receber');
  await page.getByLabel('Cliente ou número').filter({ visible: true }).fill(code);
  await expect(page.locator('tbody tr')).toHaveCount(1);
  await page.getByRole('button', { name: new RegExp(`^Dar baixa: pedido ${code}`) }).click();
  const settle = page.getByRole('dialog');
  await settle.getByLabel(/Usar adiantamento do cliente/).check();
  await settle.getByRole('button', { name: 'Confirmar recebimento' }).click();
  await expect(toast(page, 'registrada')).toBeVisible();

  const after = (
    (await (await page.request.get(`/api/customers/${customerId}/advances`)).json()) as { balance: number }
  ).balance;
  expect(after).toBeLessThan(before + 500);
  const cashAfter = ((await (await page.request.get('/api/dashboard')).json()) as { balance: number })
    .balance;
  expect(cashAfter).toBe(cashBefore);
});
