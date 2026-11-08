import { idParamSchema, opportunityFilterSchema, PERSON_ROLES, TRACE_TYPES } from '@arandue/shared/schemas';
import { sql } from 'drizzle-orm';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { db } from '../db/client.ts';
import { ctxOf, requireAuth } from '../plugins/auth.ts';
import * as accessGroups from '../services/accessGroups.ts';
import * as advances from '../services/advances.ts';
import * as agenda from '../services/agenda.ts';
import * as bankAccounts from '../services/bankAccounts.ts';
import * as company from '../services/company.ts';
import * as copies from '../services/copies.ts';
import { getCustomerFile } from '../services/customerFile.ts';
import * as customers from '../services/customers.ts';
import { getDashboard } from '../services/dashboard.ts';
import * as expenses from '../services/expenses.ts';
import * as goals from '../services/goals.ts';
import * as history from '../services/history.ts';
import * as library from '../services/library.ts';
import * as lists from '../services/lists.ts';
import * as lookup from '../services/lookup.ts';
import * as opportunities from '../services/opportunities.ts';
import * as orders from '../services/orders.ts';
import * as paymentConditions from '../services/paymentConditions.ts';
import * as people from '../services/people.ts';
import * as pipeline from '../services/pipeline.ts';
import * as preferences from '../services/preferences.ts';
import * as pricing from '../services/pricing.ts';
import * as products from '../services/products.ts';
import * as purchases from '../services/purchases.ts';
import * as quoteDocx from '../services/quoteDocx.ts';
import * as quotes from '../services/quotes.ts';
import * as reports from '../services/reports.ts';
import * as search from '../services/search.ts';
import * as stock from '../services/stock.ts';
import * as suppliers from '../services/suppliers.ts';
import * as trace from '../services/trace.ts';
import * as transactions from '../services/transactions.ts';
import * as users from '../services/users.ts';
import { authRoutes } from './auth.ts';
import { crudRoutes } from './crud.ts';

export async function apiRoutes(app: FastifyInstance): Promise<void> {
  app.get('/health', async () => {
    await db.execute(sql`SELECT 1`);
    return { status: 'ok' };
  });

  await app.register(authRoutes);

  // Tudo abaixo exige sessão válida.
  await app.register(async (protectedApp) => {
    protectedApp.addHook('preHandler', requireAuth);

    // Respostas 201 para rotas que criam registros a partir de um id na URL.
    const created =
      (handler: (request: FastifyRequest, id: number) => Promise<unknown>) =>
      async (request: FastifyRequest, reply: FastifyReply) => {
        reply.status(201);
        return handler(request, idParamSchema.parse(request.params).id);
      };

    // Cadastro único de pessoas; /customers e /suppliers são atalhos por papel.
    const peopleQuery = z.object({
      role: z.enum(PERSON_ROLES).optional(),
      q: z.string().trim().max(100).optional(),
    });
    protectedApp.get('/people', (request) =>
      people.listPeople(ctxOf(request), peopleQuery.parse(request.query)),
    );
    protectedApp.get('/people/sellers', (request) => people.listSellerOptions(ctxOf(request)));
    protectedApp.get('/people/:id', (request) =>
      people.getPerson(ctxOf(request), idParamSchema.parse(request.params).id),
    );
    protectedApp.post('/people', async (request, reply) => {
      reply.status(201);
      return people.createPerson(ctxOf(request), request.body as never);
    });
    protectedApp.put('/people/:id', (request) =>
      people.updatePerson(ctxOf(request), idParamSchema.parse(request.params).id, request.body as never),
    );
    protectedApp.delete('/people/:id', async (request, reply) => {
      await people.deletePerson(ctxOf(request), idParamSchema.parse(request.params).id);
      return reply.status(204).send();
    });
    // Consultas externas: limite próprio por usuário para não abusar dos serviços públicos.
    const lookupLimit = { rateLimit: { max: 20, timeWindow: '1 minute' } };
    protectedApp.get('/lookup/cnpj/:cnpj', { config: lookupLimit }, (request) =>
      lookup.lookupCnpj(ctxOf(request), (request.params as { cnpj: string }).cnpj),
    );
    protectedApp.get('/lookup/cep/:cep', { config: lookupLimit }, (request) =>
      lookup.lookupZip(ctxOf(request), (request.params as { cep: string }).cep),
    );
    protectedApp.get('/customers/:id/file', (request) =>
      getCustomerFile(ctxOf(request), idParamSchema.parse(request.params).id),
    );
    crudRoutes(protectedApp, '/customers', {
      list: customers.listCustomers,
      get: customers.getCustomer,
      create: customers.createCustomer,
      update: customers.updateCustomer,
      remove: customers.deleteCustomer,
    });
    crudRoutes(protectedApp, '/suppliers', {
      list: suppliers.listSuppliers,
      get: suppliers.getSupplier,
      create: suppliers.createSupplier,
      update: suppliers.updateSupplier,
      remove: suppliers.deleteSupplier,
    });
    crudRoutes(protectedApp, '/products', {
      list: products.listProducts,
      get: products.getProduct,
      create: products.createProduct,
      update: products.updateProduct,
      remove: products.deleteProduct,
    });
    protectedApp.post(
      '/products/:id/stock-adjustments',
      created((request, id) => stock.adjustStock(ctxOf(request), id, request.body as never)),
    );
    protectedApp.get('/products/:id/stock-movements', (request) =>
      stock.listStockMovements(ctxOf(request), idParamSchema.parse(request.params).id),
    );
    protectedApp.get('/bank-accounts/options', (request) =>
      bankAccounts.listBankAccountOptions(ctxOf(request)),
    );
    crudRoutes(protectedApp, '/bank-accounts', {
      list: bankAccounts.listBankAccounts,
      get: bankAccounts.getBankAccount,
      create: bankAccounts.createBankAccount,
      update: bankAccounts.updateBankAccount,
      remove: bankAccounts.deleteBankAccount,
    });
    const passwordLimit = { rateLimit: { max: 10, timeWindow: '1 minute' } };
    protectedApp.get('/customers/:id/advances', (request) =>
      advances.listAdvances(ctxOf(request), idParamSchema.parse(request.params).id),
    );
    protectedApp.post('/customers/:id/advances', async (request, reply) => {
      reply.status(201);
      return advances.createAdvance(
        ctxOf(request),
        idParamSchema.parse(request.params).id,
        request.body as never,
      );
    });
    protectedApp.post('/advances/:id/reverse', { config: passwordLimit }, (request) =>
      advances.reverseAdvance(ctxOf(request), idParamSchema.parse(request.params).id, request.body),
    );
    protectedApp.post('/expenses/pay', (request) =>
      expenses.payExpenses(ctxOf(request), request.body as never),
    );
    protectedApp.get('/expenses/:id/payments', (request) =>
      expenses.listExpensePayments(ctxOf(request), idParamSchema.parse(request.params).id),
    );
    protectedApp.post('/expense-payments/:id/reverse', { config: passwordLimit }, (request) =>
      expenses.reverseExpensePayment(ctxOf(request), idParamSchema.parse(request.params).id, request.body),
    );
    crudRoutes(protectedApp, '/expenses', {
      list: expenses.listExpenses,
      get: expenses.getExpense,
      create: expenses.createExpense,
      update: expenses.updateExpense,
      remove: expenses.deleteExpense,
    });
    crudRoutes(protectedApp, '/transactions', {
      list: transactions.listTransactions,
      get: transactions.getTransaction,
      create: transactions.createTransaction,
      update: transactions.updateTransaction,
      remove: transactions.deleteTransaction,
    });
    crudRoutes(protectedApp, '/orders', {
      list: orders.listOrders,
      get: orders.getOrder,
      create: orders.createOrder,
      update: orders.updateOrder,
      remove: orders.deleteOrder,
    });
    crudRoutes(protectedApp, '/quotes', {
      list: quotes.listQuotes,
      get: quotes.getQuote,
      create: quotes.createQuote,
      update: quotes.updateQuote,
      remove: quotes.deleteQuote,
    });
    for (const name of ['send', 'approve', 'reject', 'cancel', 'reopen'] as const) {
      protectedApp.post(`/quotes/:id/${name}`, (request) =>
        quotes.transitionQuote(
          ctxOf(request),
          idParamSchema.parse(request.params).id,
          name,
          request.body as never,
        ),
      );
    }
    protectedApp.get('/quotes/:id/mirror', (request) =>
      quotes.getQuoteMirror(ctxOf(request), idParamSchema.parse(request.params).id),
    );
    protectedApp.get('/quotes/:id/docx', async (request, reply) => {
      const file = await quoteDocx.exportQuoteDocx(ctxOf(request), idParamSchema.parse(request.params).id);
      return reply
        .header('content-type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
        .header('content-disposition', `attachment; filename="${file.filename}"`)
        .send(file.content);
    });
    protectedApp.get('/quotes/:id/internal-mirror', (request) =>
      quotes.getQuoteInternalMirror(ctxOf(request), idParamSchema.parse(request.params).id),
    );
    // Duplicar e copiar entre orçamento e pedido (menu de ações).
    protectedApp.post(
      '/quotes/:id/duplicate',
      created((r, id) => copies.duplicateQuote(ctxOf(r), id, r.body as never)),
    );
    protectedApp.post(
      '/quotes/:id/copy-to-order',
      created((r, id) => copies.copyQuoteToOrder(ctxOf(r), id, r.body as never)),
    );
    protectedApp.post(
      '/orders/:id/duplicate',
      created((r, id) => copies.duplicateOrder(ctxOf(r), id, r.body as never)),
    );
    protectedApp.post(
      '/orders/:id/copy-to-quote',
      created((r, id) => copies.copyOrderToQuote(ctxOf(r), id, r.body as never)),
    );

    protectedApp.post('/quotes/:id/convert', async (request, reply) => {
      reply.status(201);
      return quotes.convertQuote(
        ctxOf(request),
        idParamSchema.parse(request.params).id,
        request.body as never,
      );
    });

    protectedApp.post('/orders/:id/renegotiate', (request) =>
      orders.renegotiateReceivables(
        ctxOf(request),
        idParamSchema.parse(request.params).id,
        request.body as never,
      ),
    );
    protectedApp.post('/orders/:id/delivery', (request) =>
      orders.setOrderDelivery(ctxOf(request), idParamSchema.parse(request.params).id, request.body as never),
    );
    protectedApp.get('/receivables', (request) => orders.listReceivables(ctxOf(request), request.query));
    protectedApp.post('/orders/:id/settle', (request) =>
      orders.settleOrder(ctxOf(request), idParamSchema.parse(request.params).id, request.body as never),
    );
    protectedApp.post('/receivables/settle', (request) =>
      orders.settleReceivables(ctxOf(request), request.body as never),
    );
    // Rotas que conferem a senha: o mesmo limite do login, contra tentativa e erro.
    protectedApp.post('/receivable-payments/:id/reverse', { config: passwordLimit }, (request) =>
      orders.reversePayment(ctxOf(request), idParamSchema.parse(request.params).id, request.body),
    );
    protectedApp.post('/orders/:id/undo-payments', { config: passwordLimit }, (request) =>
      orders.undoOrderPayments(ctxOf(request), idParamSchema.parse(request.params).id, request.body),
    );
    protectedApp.post('/receivables/:id/settle', (request) =>
      orders.settleReceivable(ctxOf(request), idParamSchema.parse(request.params).id, request.body as never),
    );

    crudRoutes(protectedApp, '/access-groups', {
      list: accessGroups.listAccessGroups,
      get: accessGroups.getAccessGroup,
      create: accessGroups.createAccessGroup,
      update: accessGroups.updateAccessGroup,
      remove: accessGroups.deleteAccessGroup,
    });

    // CRM: oportunidades, etapas do funil e atividades.
    protectedApp.get('/opportunities', (request) =>
      opportunities.listOpportunities(ctxOf(request), opportunityFilterSchema.parse(request.query)),
    );
    protectedApp.get('/opportunities/owners', (request) => opportunities.listOwnerOptions(ctxOf(request)));
    protectedApp.get('/opportunities/:id', (request) =>
      opportunities.getOpportunity(ctxOf(request), idParamSchema.parse(request.params).id),
    );
    protectedApp.post('/opportunities', async (request, reply) => {
      reply.status(201);
      return opportunities.createOpportunity(ctxOf(request), request.body as never);
    });
    protectedApp.put('/opportunities/:id', (request) =>
      opportunities.updateOpportunity(
        ctxOf(request),
        idParamSchema.parse(request.params).id,
        request.body as never,
      ),
    );
    protectedApp.delete('/opportunities/:id', async (request, reply) => {
      await opportunities.deleteOpportunity(ctxOf(request), idParamSchema.parse(request.params).id);
      return reply.status(204).send();
    });
    protectedApp.post('/opportunities/:id/stage', (request) =>
      opportunities.moveToStage(
        ctxOf(request),
        idParamSchema.parse(request.params).id,
        request.body as never,
      ),
    );
    protectedApp.post('/opportunities/:id/status', (request) =>
      opportunities.setStatus(ctxOf(request), idParamSchema.parse(request.params).id, request.body as never),
    );
    protectedApp.post(
      '/opportunities/:id/interactions',
      created((r, id) => opportunities.addInteraction(ctxOf(r), id, r.body as never)),
    );

    protectedApp.get('/pipeline-stages', (request) => pipeline.listStages(ctxOf(request)));
    protectedApp.post('/pipeline-stages', async (request, reply) => {
      reply.status(201);
      return pipeline.createStage(ctxOf(request), request.body as never);
    });
    protectedApp.put('/pipeline-stages/order', (request) =>
      pipeline.reorderStages(ctxOf(request), request.body as never),
    );
    protectedApp.put('/pipeline-stages/:id', (request) =>
      pipeline.updateStage(ctxOf(request), idParamSchema.parse(request.params).id, request.body as never),
    );
    protectedApp.delete('/pipeline-stages/:id', async (request, reply) => {
      await pipeline.deleteStage(ctxOf(request), idParamSchema.parse(request.params).id);
      return reply.status(204).send();
    });

    // Rastreio: cadeia de documentos, vincular/desvincular e criar oportunidade a partir de documento.
    const traceParams = z.object({ type: z.enum(TRACE_TYPES), id: z.coerce.number().int().positive() });
    protectedApp.get('/trace/:type/:id', (request) => {
      const { type, id } = traceParams.parse(request.params);
      return trace.getTrace(ctxOf(request), type, id);
    });
    // Histórico de alterações: tela geral, lista do documento e detalhe de um registro.
    protectedApp.get('/history', (request) => history.listHistory(ctxOf(request), request.query as never));
    protectedApp.get('/history/options', (request) => history.historyFilterOptions(ctxOf(request)));
    protectedApp.get('/history/entry/:id', (request) =>
      history.getHistoryEntry(ctxOf(request), idParamSchema.parse(request.params).id),
    );
    const historyParams = z.object({
      type: z.enum(['quote', 'order']),
      id: z.coerce.number().int().positive(),
    });
    protectedApp.get('/history/:type/:id', (request) => {
      const { type, id } = historyParams.parse(request.params);
      return history.listDocumentHistory(ctxOf(request), type, id);
    });
    for (const [path, type] of [
      ['quotes', 'quote'],
      ['orders', 'order'],
    ] as const) {
      protectedApp.post(`/${path}/:id/link`, async (request) => {
        const { id } = idParamSchema.parse(request.params);
        await trace.linkDocument(ctxOf(request), type, id, request.body as never);
        return trace.getTrace(ctxOf(request), type, id);
      });
      protectedApp.post(
        `/${path}/:id/opportunity`,
        created((r, id) => trace.createFromDocument(ctxOf(r), type, id)),
      );
    }

    // Usuários não têm DELETE: são desativados (preserva a auditoria).
    protectedApp.get('/users', (request) => users.listUsers(ctxOf(request)));
    protectedApp.get('/users/:id', (request) =>
      users.getUser(ctxOf(request), idParamSchema.parse(request.params).id),
    );
    protectedApp.post('/users', async (request, reply) => {
      reply.status(201);
      return users.createUser(ctxOf(request), request.body as never);
    });
    protectedApp.put('/users/:id', (request) =>
      users.updateUser(ctxOf(request), idParamSchema.parse(request.params).id, request.body as never),
    );

    protectedApp.get('/dashboard', (request) => getDashboard(ctxOf(request)));
    protectedApp.get('/search', (request) => search.search(ctxOf(request), request.query));
    protectedApp.get('/agenda', (request) => agenda.getAgenda(ctxOf(request), request.query));
    protectedApp.post('/agenda/events', async (request, reply) => {
      reply.status(201);
      return agenda.createAgendaEvent(ctxOf(request), request.body as never);
    });
    protectedApp.put('/agenda/events/:id', (request) =>
      agenda.updateAgendaEvent(ctxOf(request), idParamSchema.parse(request.params).id, request.body as never),
    );
    protectedApp.delete('/agenda/events/:id', async (request, reply) => {
      await agenda.deleteAgendaEvent(ctxOf(request), idParamSchema.parse(request.params).id);
      return reply.status(204).send();
    });
    protectedApp.get('/reports', (request) => reports.listReports(ctxOf(request)));
    const reportParams = z.object({ id: z.string().regex(/^[a-z_]+$/) });
    protectedApp.get('/reports/:id', (request) =>
      reports.getReport(ctxOf(request), reportParams.parse(request.params).id, request.query as never),
    );
    protectedApp.get('/reports/:id/csv', async (request, reply) => {
      const file = await reports.exportReport(
        ctxOf(request),
        reportParams.parse(request.params).id,
        request.query as never,
      );
      return reply
        .header('content-type', 'text/csv; charset=utf-8')
        .header('content-disposition', `attachment; filename="${file.filename}"`)
        .send(file.content);
    });
    const allQuery = (request: FastifyRequest) => ({ all: (request.query as { all?: string }).all === '1' });
    protectedApp.get('/text-snippets', (request) => library.listSnippets(ctxOf(request), allQuery(request)));
    protectedApp.post('/text-snippets', async (request, reply) => {
      reply.status(201);
      return library.createSnippet(ctxOf(request), request.body as never);
    });
    protectedApp.put('/text-snippets/:id', (request) =>
      library.updateSnippet(ctxOf(request), idParamSchema.parse(request.params).id, request.body as never),
    );
    protectedApp.get('/item-templates', (request) =>
      library.listTemplates(ctxOf(request), allQuery(request)),
    );
    protectedApp.post('/item-templates', async (request, reply) => {
      reply.status(201);
      return library.createTemplate(ctxOf(request), request.body as never);
    });
    protectedApp.put('/item-templates/:id', (request) =>
      library.updateTemplate(ctxOf(request), idParamSchema.parse(request.params).id, request.body as never),
    );
    protectedApp.get('/pricing/base', (request) => pricing.getPricingBase(ctxOf(request)));
    protectedApp.get('/purchases', (request) => purchases.listPurchases(ctxOf(request)));
    protectedApp.get('/purchases/:id', (request) =>
      purchases.getPurchase(ctxOf(request), idParamSchema.parse(request.params).id),
    );
    protectedApp.post('/purchases', async (request, reply) => {
      reply.status(201);
      return purchases.createPurchase(ctxOf(request), request.body as never);
    });
    protectedApp.put('/purchases/:id', (request) =>
      purchases.updatePurchase(ctxOf(request), idParamSchema.parse(request.params).id, request.body as never),
    );
    protectedApp.post('/purchases/:id/receive', (request) =>
      purchases.receivePurchase(ctxOf(request), idParamSchema.parse(request.params).id),
    );
    protectedApp.post('/purchases/:id/cancel', (request) =>
      purchases.cancelPurchase(ctxOf(request), idParamSchema.parse(request.params).id, request.body),
    );
    protectedApp.get('/goals', (request) => goals.getGoals(ctxOf(request), request.query));
    protectedApp.put('/goals', (request) => goals.saveGoals(ctxOf(request), request.body as never));
    protectedApp.get('/preferences/dashboard', (request) => preferences.getDashboardLayout(ctxOf(request)));
    protectedApp.put('/preferences/dashboard', (request) =>
      preferences.saveDashboardLayout(
        ctxOf(request),
        (request.body as { layout?: unknown } | null)?.layout ?? null,
      ),
    );
    protectedApp.get('/payment-conditions', (request) =>
      paymentConditions.listPaymentConditions(ctxOf(request), {
        all: (request.query as { all?: string }).all === '1',
      }),
    );
    protectedApp.post('/payment-conditions', async (request, reply) => {
      reply.status(201);
      return paymentConditions.createPaymentCondition(ctxOf(request), request.body as never);
    });
    protectedApp.put('/payment-conditions/:id', (request) =>
      paymentConditions.updatePaymentCondition(
        ctxOf(request),
        idParamSchema.parse(request.params).id,
        request.body as never,
      ),
    );
    protectedApp.get('/lists', (request) =>
      lists.listLists(ctxOf(request), { all: (request.query as { all?: string }).all === '1' }),
    );
    protectedApp.post('/lists', async (request, reply) => {
      reply.status(201);
      return lists.createListItem(ctxOf(request), request.body as never);
    });
    protectedApp.put('/lists/:id', (request) =>
      lists.updateListItem(ctxOf(request), idParamSchema.parse(request.params).id, request.body as never),
    );
    protectedApp.get('/company', (request) => company.getCompanySettings(ctxOf(request)));
    protectedApp.put('/company', (request) =>
      company.updateCompanySettings(ctxOf(request), request.body as never),
    );
  });
}
