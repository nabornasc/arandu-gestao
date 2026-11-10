import { can, type Permission } from '@arandue/shared/permissions';
import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../db/client.ts';
import type { Ctx } from '../../lib/context.ts';
import { AppError } from '../../lib/errors.ts';
import { reportError } from '../../lib/monitoring.ts';
import { formatCode } from '../numbering.ts';
import { todayInBrazil } from '../orders.ts';
import { ACTION_TOOLS, proposeAction, type ToolSession } from './actions.ts';

// Ferramentas do assistente. As de consulta só leem; as "propor_..." (actions.ts) só criam uma ação pendente.
// Cada uma exige a mesma permissão da tela equivalente, e a ferramenta sem permissão nem vai ao modelo.
// Ao modelo vão só os campos necessários: CPF, CNPJ, e-mail e telefone ficam de fora.
export interface AssistantTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  permission: Permission;
  run(ctx: Ctx, input: unknown, session?: ToolSession): Promise<unknown>;
}

const LIST_LIMIT = 15;
const money = (value: unknown) => Math.round(Number(value ?? 0) * 100) / 100;
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use AAAA-MM-DD.');
const escapeLike = (value: string) => value.replace(/[\\%_]/g, (char) => `\\${char}`);

const revenueInput = z.object({ de: date.optional(), ate: date.optional() });

const faturamento: AssistantTool = {
  name: 'faturamento_do_periodo',
  description:
    'Faturamento e vendas da empresa num período. Sem datas, usa o mês atual até hoje. ' +
    'Faturado = pedidos pagos ou concluídos (com juros e descontos das baixas). Vendas = pedidos não cancelados.',
  inputSchema: {
    type: 'object',
    properties: {
      de: { type: 'string', description: 'Data inicial, AAAA-MM-DD' },
      ate: { type: 'string', description: 'Data final, AAAA-MM-DD' },
    },
  },
  permission: 'analytics.read',
  async run(ctx, input) {
    const today = todayInBrazil();
    const data = revenueInput.parse(input ?? {});
    const from = data.de ?? `${today.slice(0, 7)}-01`;
    const to = data.ate ?? today;
    const [row] = await db.execute<Record<string, string | number>>(sql`
      SELECT
        COALESCE(SUM(total) FILTER (WHERE status IN ('paid', 'completed')), 0)
        + COALESCE((SELECT SUM(p.interest - p.discount)
                    FROM receivable_payments p JOIN orders o ON o.id = p.order_id
                    WHERE p.company_id = ${ctx.companyId} AND p.reversed_at IS NULL
                      AND o.status IN ('paid', 'completed')
                      AND o.order_date BETWEEN ${from} AND ${to}), 0) AS faturado,
        COUNT(*) FILTER (WHERE status <> 'cancelled')::int AS pedidos,
        COALESCE(SUM(total) FILTER (WHERE status <> 'cancelled'), 0) AS vendas,
        COUNT(*) FILTER (WHERE status = 'pending')::int AS pedidos_pendentes
      FROM orders
      WHERE company_id = ${ctx.companyId} AND order_date BETWEEN ${from} AND ${to}`);
    return {
      periodo: { de: from, ate: to },
      faturado: money(row?.faturado),
      vendas: money(row?.vendas),
      pedidos: Number(row?.pedidos ?? 0),
      pedidosPendentes: Number(row?.pedidos_pendentes ?? 0),
      tela: '/',
    };
  },
};

const receberVencidas: AssistantTool = {
  name: 'contas_a_receber_vencidas',
  description:
    'Contas a receber vencidas e ainda em aberto: total, quantidade e as mais antigas, com cliente, pedido, ' +
    'vencimento, valor em aberto e dias de atraso.',
  inputSchema: { type: 'object', properties: {} },
  permission: 'receivables.read',
  async run(ctx) {
    const today = todayInBrazil();
    const rows = await db.execute<{
      cliente: string | null;
      pedido: number;
      vencimento: string;
      em_aberto: string;
      dias: number;
      total: string;
      quantidade: number;
    }>(sql`
      SELECT pe.name AS cliente, o.number AS pedido, r.due_date AS vencimento,
             r.amount - r.paid_amount AS em_aberto, (${today}::date - r.due_date)::int AS dias,
             SUM(r.amount - r.paid_amount) OVER () AS total, COUNT(*) OVER ()::int AS quantidade
      FROM receivables r
      JOIN orders o ON o.id = r.order_id
      LEFT JOIN people pe ON pe.id = o.customer_id
      WHERE r.company_id = ${ctx.companyId} AND r.status = 'open' AND r.due_date < ${today}
      ORDER BY r.due_date, r.id
      LIMIT ${LIST_LIMIT}`);
    return {
      total: money(rows[0]?.total),
      quantidade: rows[0]?.quantidade ?? 0,
      maisAntigas: rows.map((row) => ({
        cliente: row.cliente ?? 'Sem cliente',
        pedido: formatCode(row.pedido),
        vencimento: row.vencimento,
        emAberto: money(row.em_aberto),
        diasDeAtraso: row.dias,
      })),
      tela: '/contas-a-receber',
    };
  },
};

const pagarSemana: AssistantTool = {
  name: 'contas_a_pagar_da_semana',
  description:
    'Contas a pagar (despesas) em aberto que vencem nos próximos 7 dias, incluindo as já vencidas: ' +
    'descrição, categoria, fornecedor, vencimento, valor em aberto e se está vencida.',
  inputSchema: { type: 'object', properties: {} },
  permission: 'payables.read',
  async run(ctx) {
    const today = todayInBrazil();
    const rows = await db.execute<{
      descricao: string;
      categoria: string;
      fornecedor: string | null;
      vencimento: string;
      em_aberto: string;
      total: string;
      quantidade: number;
    }>(sql`
      SELECT e.description AS descricao, e.category AS categoria, pe.name AS fornecedor,
             e.expense_date AS vencimento, e.amount - e.paid_amount AS em_aberto,
             SUM(e.amount - e.paid_amount) OVER () AS total, COUNT(*) OVER ()::int AS quantidade
      FROM expenses e
      LEFT JOIN people pe ON pe.id = e.supplier_id
      WHERE e.company_id = ${ctx.companyId} AND e.status = 'pending'
        AND e.expense_date <= ${today}::date + 7
      ORDER BY e.expense_date, e.id
      LIMIT ${LIST_LIMIT}`);
    return {
      hoje: today,
      total: money(rows[0]?.total),
      quantidade: rows[0]?.quantidade ?? 0,
      contas: rows.map((row) => ({
        descricao: row.descricao,
        categoria: row.categoria,
        fornecedor: row.fornecedor,
        vencimento: row.vencimento,
        emAberto: money(row.em_aberto),
        vencida: row.vencimento < today,
      })),
      tela: '/despesas',
    };
  },
};

const estoqueBaixo: AssistantTool = {
  name: 'estoque_baixo',
  description: 'Produtos ativos com estoque no mínimo cadastrado ou abaixo dele.',
  inputSchema: { type: 'object', properties: {} },
  permission: 'products.read',
  async run(ctx) {
    const rows = await db.execute<{
      nome: string;
      codigo: string | null;
      estoque: string;
      minimo: string;
      unidade: string | null;
      quantidade: number;
    }>(sql`
      SELECT name AS nome, code AS codigo, stock AS estoque, min_stock AS minimo, unit AS unidade,
             COUNT(*) OVER ()::int AS quantidade
      FROM products
      WHERE company_id = ${ctx.companyId} AND active AND min_stock IS NOT NULL AND stock <= min_stock
      ORDER BY stock - min_stock, name
      LIMIT ${LIST_LIMIT}`);
    return {
      quantidade: rows[0]?.quantidade ?? 0,
      produtos: rows.map((row) => ({
        nome: row.nome,
        codigo: row.codigo,
        estoque: Number(row.estoque),
        minimo: Number(row.minimo),
        unidade: row.unidade,
      })),
      tela: '/produtos',
    };
  },
};

const customerInput = z.object({ nome: z.string().trim().min(2).max(80) });

const buscarCliente: AssistantTool = {
  name: 'buscar_cliente',
  description:
    'Procura clientes ativos pelo nome (até 5). Devolve cidade, endereço da ficha no sistema e, ' +
    'para quem vê contas a receber, o valor em aberto e o vencido.',
  inputSchema: {
    type: 'object',
    properties: { nome: { type: 'string', description: 'Nome ou parte do nome do cliente' } },
    required: ['nome'],
  },
  permission: 'customers.read',
  async run(ctx, input) {
    const { nome } = customerInput.parse(input);
    const withReceivables = can(ctx.permissions, 'receivables.read');
    const today = todayInBrazil();
    const rows = await db.execute<{
      id: number;
      nome: string;
      cidade: string | null;
      uf: string | null;
      em_aberto: string | null;
      vencido: string | null;
    }>(sql`
      SELECT pe.id, pe.name AS nome, pe.city AS cidade, pe.state AS uf,
             ${
               withReceivables
                 ? sql`(SELECT SUM(r.amount - r.paid_amount) FROM receivables r JOIN orders o ON o.id = r.order_id
                        WHERE o.customer_id = pe.id AND r.status = 'open') AS em_aberto,
                       (SELECT SUM(r.amount - r.paid_amount) FROM receivables r JOIN orders o ON o.id = r.order_id
                        WHERE o.customer_id = pe.id AND r.status = 'open' AND r.due_date < ${today}) AS vencido`
                 : sql`NULL AS em_aberto, NULL AS vencido`
             }
      FROM people pe
      WHERE pe.company_id = ${ctx.companyId} AND pe.active AND pe.is_customer
        AND pe.name ILIKE ${`%${escapeLike(nome)}%`}
      ORDER BY pe.name
      LIMIT 5`);
    return {
      clientes: rows.map((row) => ({
        id: row.id,
        nome: row.nome,
        cidade: row.cidade ? `${row.cidade}${row.uf ? `/${row.uf}` : ''}` : null,
        ficha: `/clientes/${row.id}/ficha`,
        ...(withReceivables && { emAberto: money(row.em_aberto), vencido: money(row.vencido) }),
      })),
    };
  },
};

const productInput = z.object({ busca: z.string().trim().min(2).max(80) });

const buscarProduto: AssistantTool = {
  name: 'buscar_produto',
  description:
    'Procura produtos e serviços ativos pelo nome ou código (até 8). Devolve o id (para itens de orçamento), ' +
    'o preço de venda, a unidade e o estoque.',
  inputSchema: {
    type: 'object',
    properties: { busca: { type: 'string', description: 'Nome ou código do produto' } },
    required: ['busca'],
  },
  permission: 'products.read',
  async run(ctx, input) {
    const { busca } = productInput.parse(input);
    const like = `%${escapeLike(busca)}%`;
    const rows = await db.execute<{
      id: number;
      nome: string;
      codigo: string | null;
      tipo: string;
      preco: string;
      unidade: string | null;
      estoque: string | null;
    }>(sql`
      SELECT id, name AS nome, code AS codigo, type AS tipo, price AS preco, unit AS unidade, stock AS estoque
      FROM products
      WHERE company_id = ${ctx.companyId} AND active AND (name ILIKE ${like} OR code ILIKE ${like})
      ORDER BY name
      LIMIT 8`);
    return {
      produtos: rows.map((row) => ({
        id: row.id,
        nome: row.nome,
        codigo: row.codigo,
        tipo: row.tipo === 'service' ? 'serviço' : 'produto',
        preco: money(row.preco),
        unidade: row.unidade,
        estoque: row.estoque === null ? null : Number(row.estoque),
      })),
    };
  },
};

// Ferramentas que propõem gravações: criam a ação pendente; quem grava é o botão Confirmar.
const actionTools: AssistantTool[] = ACTION_TOOLS.map((action) => ({
  name: action.tool,
  description: action.description,
  inputSchema: action.inputSchema,
  permission: action.permission,
  run: (ctx, input, session) => {
    if (!session) throw new Error('Ação sem sessão do assistente.');
    return proposeAction(ctx, action.kind, input, session);
  },
}));

export const ASSISTANT_TOOLS: AssistantTool[] = [
  faturamento,
  receberVencidas,
  pagarSemana,
  estoqueBaixo,
  buscarCliente,
  buscarProduto,
  ...actionTools,
];

// Só as ferramentas que o usuário pode usar, sempre na mesma ordem (ajuda o cache de prompt).
export const toolsFor = (ctx: Ctx) => ASSISTANT_TOOLS.filter((tool) => can(ctx.permissions, tool.permission));

// Executa a ferramenta pedida pelo modelo. Erro vira texto para o modelo, nunca exceção para o usuário.
export async function runTool(
  ctx: Ctx,
  name: string,
  input: unknown,
  session?: ToolSession,
): Promise<string> {
  const tool = toolsFor(ctx).find((item) => item.name === name);
  if (!tool) return JSON.stringify({ erro: 'Ferramenta indisponível para este usuário.' });
  try {
    return JSON.stringify(await tool.run(ctx, input, session));
  } catch (error) {
    if (error instanceof z.ZodError) return JSON.stringify({ erro: 'Parâmetros inválidos.' });
    if (error instanceof AppError) return JSON.stringify({ erro: error.message });
    // Falha inesperada numa ferramenta não derruba a resposta: o modelo avisa o usuário e o erro vai ao log.
    console.error(
      `[assistente] falha na ferramenta ${name}:`,
      error instanceof Error ? error.message : error,
    );
    await reportError(error);
    return JSON.stringify({ erro: 'Não foi possível consultar agora.' });
  }
}
