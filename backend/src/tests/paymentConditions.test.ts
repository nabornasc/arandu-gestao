import { conditionInstallments } from '@arandue/shared/schemas';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { addMember, type Client, createApp, signupCompany } from './helpers.ts';

let app: FastifyInstance;
let owner: Client;

beforeAll(async () => {
  app = await createApp();
  owner = await signupCompany(app);
});
afterAll(() => app.close());

describe('condições de pagamento', () => {
  it('empresa nova começa com as condições padrão', async () => {
    const names = (await owner.get('/payment-conditions')).body.map((row: { name: string }) => row.name);
    expect([...names].sort()).toEqual(
      ['30 dias', '30/60 dias', '30/60/90 dias', 'À vista', 'Entrada 50% + 30 dias'].sort(),
    );
  });

  it('cria, valida, renomeia e desativa; desativada some da lista dos documentos', async () => {
    const bad = [
      { name: 'Sem nada' },
      { name: 'Fora de ordem', days: [60, 30] },
      { name: 'Repetido', days: [30, 30] },
      { name: 'Tudo na entrada e prazo', downPaymentPercent: 100, days: [30] },
    ];
    for (const body of bad) expect((await owner.post('/payment-conditions', body)).status).toBe(400);

    const created = await owner.post('/payment-conditions', {
      name: 'Entrada 30% + 28/56',
      downPaymentPercent: 30,
      downPaymentMethod: 'PIX',
      days: [28, 56],
      method: 'Cartão de crédito',
    });
    expect(created.status).toBe(201);
    expect((await owner.post('/payment-conditions', { name: 'entrada 30% + 28/56', days: [1] })).status).toBe(
      409,
    );

    const id = created.body.id;
    await owner.put(`/payment-conditions/${id}`, { ...created.body, active: false });
    const active = (await owner.get('/payment-conditions')).body.map((row: { id: number }) => row.id);
    expect(active).not.toContain(id);
    const all = (await owner.get('/payment-conditions?all=1')).body.map((row: { id: number }) => row.id);
    expect(all).toContain(id);

    // A desativação fica no histórico.
    const entry = (await owner.get('/history')).body.rows[0];
    expect(entry.summary).toBe('Alterou ativo');
  });

  it('só quem configura a empresa cria; todos leem as ativas; empresas separadas', async () => {
    const seller = await addMember(app, owner, 'seller');
    expect((await seller.get('/payment-conditions')).status).toBe(200);
    expect((await seller.get('/payment-conditions?all=1')).status).toBe(403);
    expect((await seller.post('/payment-conditions', { name: 'X', days: [10] })).status).toBe(403);

    const other = await signupCompany(app);
    const mine = (await owner.get('/payment-conditions')).body[0].id;
    expect((await other.put(`/payment-conditions/${mine}`, { name: 'Invasão', days: [1] })).status).toBe(404);
  });

  it('gera as parcelas: entrada no dia, prazos em dias e centavos que fecham com o total', () => {
    expect(
      conditionInstallments(
        { downPaymentPercent: 30, downPaymentMethod: 'PIX', days: [30, 60], method: 'Boleto' },
        100,
        '2026-11-08',
      ),
    ).toEqual([
      { dueDate: '2026-11-08', amount: 30, method: 'PIX' },
      { dueDate: '2026-12-08', amount: 35, method: 'Boleto' },
      { dueDate: '2027-01-07', amount: 35, method: 'Boleto' },
    ]);
    const thirds = conditionInstallments(
      { downPaymentPercent: 0, downPaymentMethod: null, days: [30, 60, 90], method: null },
      100,
      '2026-11-08',
    );
    expect(thirds.map((row) => row.amount)).toEqual([33.34, 33.33, 33.33]);
    expect(
      conditionInstallments(
        { downPaymentPercent: 100, downPaymentMethod: 'PIX', days: [], method: null },
        59.9,
        '2026-11-08',
      ),
    ).toEqual([{ dueDate: '2026-11-08', amount: 59.9, method: 'PIX' }]);
  });
});
