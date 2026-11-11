import { expect, test } from '@playwright/test';
import { capture, login, OWNER, SERVICE, toast } from './helpers.ts';

test('CRM como central: rastreio, linha do tempo de todos os setores e anexos', async ({ page }) => {
  await login(page, OWNER);
  // Oportunidade com um orçamento enviado, criados pela API com a sessão da página.
  const title = `Central ${Date.now()}`;
  const opportunity = await (
    await page.request.post('/api/opportunities', { data: { title, contactName: 'Ana', source: 'Site' } })
  ).json();
  const products = (await (await page.request.get('/api/products')).json()) as { id: number; name: string }[];
  const productId = products.find((product) => product.name === SERVICE)?.id;
  const quote = await (
    await page.request.post('/api/quotes', {
      data: { opportunityId: opportunity.id, items: [{ productId, quantity: 1 }] },
    })
  ).json();
  expect((await page.request.post(`/api/quotes/${quote.id}/send`)).ok()).toBe(true);

  await page.goto(`/crm/${opportunity.id}`);
  const tracking = page.locator('.linked-docs');
  await expect(tracking.getByRole('heading', { name: 'Rastreio dos documentos' })).toBeVisible();
  await expect(tracking.getByRole('link', { name: new RegExp(`#0*${quote.number}$`) })).toBeVisible();

  const timeline = page.locator('.timeline');
  await expect(timeline.getByText('Orçamento', { exact: true }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Orçamentos', exact: true }).click();
  await expect(timeline.locator('li').first()).toContainText('Orçamento');
  await page.getByRole('button', { name: 'Tudo', exact: true }).click();

  // Foto de 1x1 pixel, enviada pelo navegador direto ao armazenamento.
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
  );
  await page.getByLabel('Arquivos para anexar').setInputFiles({
    name: 'fachada.png',
    mimeType: 'image/png',
    buffer: png,
  });
  await expect(toast(page, 'Anexo adicionado.')).toBeVisible();
  const grid = page.getByRole('list', { name: 'Anexos da oportunidade' });
  await expect(grid.getByRole('img', { name: 'fachada.png' })).toBeVisible();
  await expect(timeline.getByText('fachada.png')).toBeVisible();
  await capture(page, 'crm-central');

  await grid.getByRole('button', { name: 'Excluir fachada.png' }).click();
  await expect(toast(page, 'Anexo excluído.')).toBeVisible();
  await expect(page.getByText('Nenhum anexo ainda.')).toBeVisible();
});
