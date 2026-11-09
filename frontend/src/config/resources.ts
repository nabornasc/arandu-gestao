import type { Area, Permission } from '@arandue/shared/permissions';
import type { ListKind } from '@arandue/shared/schemas';
import { bankAccountSchema, expenseSchema, productSchema, transactionSchema } from '@arandue/shared/schemas';
import type { z } from 'zod';

export type FieldType = 'text' | 'email' | 'number' | 'date' | 'select' | 'account' | 'supplier';

export interface Field {
  key: string;
  label: string;
  type: FieldType;
  options?: [string, string][];
  required?: boolean;
  // Campo que só aparece para quem tem esta permissão.
  permission?: Permission;
  // Só no cadastro novo; depois, muda por outra ação (ex.: estoque, pelo ajuste).
  createOnly?: boolean;
  // Lista da empresa sugerida no campo de texto, que continua aceitando outro valor.
  suggestions?: ListKind;
}

export interface ResourceConfig {
  title: string;
  endpoint: string;
  // Área de permissões com ver, criar, editar e excluir.
  area: Extract<Area, 'products' | 'payables' | 'bank_accounts' | 'cash'>;
  schema: z.ZodType;
  fields: Field[];
  columns: [string, string][];
  // Aviso ao lado do valor de uma coluna (ex.: estoque baixo).
  badge?: (key: string, row: Record<string, unknown>) => string | null;
  // "Copiar" na linha: valores de partida do cadastro novo, a partir do registro copiado.
  copy?: (row: Record<string, unknown>) => Record<string, unknown>;
  // Registros gerados automaticamente não podem ser editados nesta tela.
  isLocked?: (row: Record<string, unknown>) => boolean;
  // Filtros e totais da lista, nas telas com lançamentos por data.
  list?: {
    // A lista é filtrada e paginada no servidor; aqui ficam só os rótulos dos filtros.
    dateLabel: string;
    textLabel: string;
    statuses?: readonly (readonly [string, string])[];
    // Os totais vêm somados pelo servidor, sobre todo o filtro.
    totals: (sums: Record<string, number>) => { label: string; value: number }[];
  };
}

export const resources = {
  products: {
    title: 'Produtos e serviços',
    endpoint: '/products',
    area: 'products',
    schema: productSchema,
    fields: [
      { key: 'name', label: 'Nome', type: 'text', required: true },
      { key: 'code', label: 'Código (opcional)', type: 'text' },
      {
        key: 'type',
        label: 'Tipo',
        type: 'select',
        options: [
          ['product', 'Produto'],
          ['service', 'Serviço'],
        ],
        required: true,
      },
      { key: 'price', label: 'Preço de venda (R$)', type: 'number', required: true },
      { key: 'cost', label: 'Custo unitário (R$)', type: 'number', permission: 'costs.read' },
      {
        key: 'unit',
        label: 'Unidade',
        type: 'select',
        options: [
          ['UN', 'Unidade (UN)'],
          ['CX', 'Caixa (CX)'],
          ['KG', 'Quilo (KG)'],
          ['L', 'Litro (L)'],
          ['M', 'Metro (M)'],
          ['M2', 'Metro quadrado (M2)'],
        ],
      },
      { key: 'groupName', label: 'Grupo', type: 'text', suggestions: 'product_group' },
      { key: 'stock', label: 'Estoque inicial (vazio para serviço)', type: 'number', createOnly: true },
      { key: 'minStock', label: 'Estoque mínimo (aviso)', type: 'number' },
    ],
    columns: [
      ['code', 'Código'],
      ['name', 'Nome'],
      ['type', 'Tipo'],
      ['groupName', 'Grupo'],
      ['price', 'Preço'],
      ['stock', 'Estoque'],
      ['unit', 'Unidade'],
      ['minStock', 'Mínimo'],
    ],
    badge: (key, row) => (key === 'stock' && row.lowStock ? 'Estoque baixo' : null),
    // A cópia começa sem código (é único) e com estoque zero: o saldo entra pelo ajuste ou pela compra.
    copy: (row) => ({
      ...row,
      name: `${String(row.name)} (cópia)`.slice(0, 120),
      code: null,
      stock: row.stock === null || row.stock === undefined ? null : 0,
    }),
  },
  expenses: {
    title: 'Contas a pagar (despesas)',
    endpoint: '/expenses',
    area: 'payables',
    schema: expenseSchema,
    fields: [
      { key: 'description', label: 'Descrição', type: 'text', required: true },
      {
        key: 'category',
        label: 'Categoria (ex.: Aluguel)',
        type: 'text',
        required: true,
        suggestions: 'financial_category',
      },
      { key: 'amount', label: 'Valor (R$)', type: 'number', required: true },
      { key: 'expenseDate', label: 'Vencimento / pagamento', type: 'date', required: true },
      {
        key: 'status',
        label: 'Status',
        type: 'select',
        options: [
          ['pending', 'Pendente'],
          ['paid', 'Pago'],
        ],
        required: true,
      },
      { key: 'bankAccountId', label: 'Conta de débito', type: 'account' },
      { key: 'supplierId', label: 'Fornecedor', type: 'supplier', permission: 'suppliers.read' },
    ],
    columns: [
      ['description', 'Descrição'],
      ['supplierName', 'Fornecedor'],
      ['category', 'Categoria'],
      ['amount', 'Valor'],
      ['paidAmount', 'Pago'],
      ['expenseDate', 'Data'],
      ['status', 'Status'],
    ],
    // Pendente com valor pago é parcial.
    badge: (key, row) =>
      key === 'status' && row.status === 'pending' && Number(row.paidAmount) > 0 ? 'Parcial' : null,
    list: {
      dateLabel: 'Vencimento ou pagamento',
      textLabel: 'Descrição, categoria ou fornecedor',
      statuses: [
        ['pending', 'Pendente'],
        ['paid', 'Pago'],
      ],
      totals: (sums) => [
        { label: 'Valor total', value: sums.amount ?? 0 },
        { label: 'Pago', value: sums.paid ?? 0 },
        { label: 'Em aberto', value: sums.pending ?? 0 },
      ],
    },
  },
  accounts: {
    title: 'Contas bancárias',
    endpoint: '/bank-accounts',
    area: 'bank_accounts',
    schema: bankAccountSchema,
    fields: [
      { key: 'bankName', label: 'Instituição / carteira', type: 'text', required: true },
      { key: 'accountName', label: 'Nome da conta', type: 'text', required: true },
      {
        key: 'accountType',
        label: 'Tipo de conta',
        type: 'select',
        options: [
          ['checking', 'Corrente'],
          ['savings', 'Poupança'],
          ['cash', 'Caixa físico'],
        ],
        required: true,
      },
      { key: 'initialBalance', label: 'Saldo inicial (R$)', type: 'number', required: true },
    ],
    columns: [
      ['accountName', 'Conta'],
      ['bankName', 'Instituição'],
      ['accountType', 'Tipo'],
      ['initialBalance', 'Saldo inicial'],
    ],
  },
  transactions: {
    title: 'Movimentações de caixa',
    endpoint: '/transactions',
    area: 'cash',
    schema: transactionSchema,
    fields: [
      {
        key: 'type',
        label: 'Tipo',
        type: 'select',
        options: [
          ['income', 'Entrada'],
          ['outcome', 'Saída'],
        ],
        required: true,
      },
      {
        key: 'category',
        label: 'Categoria',
        type: 'text',
        required: true,
        suggestions: 'financial_category',
      },
      { key: 'description', label: 'Descrição', type: 'text', required: true },
      { key: 'amount', label: 'Valor (R$)', type: 'number', required: true },
      { key: 'transactionDate', label: 'Data', type: 'date', required: true },
      { key: 'bankAccountId', label: 'Conta bancária', type: 'account' },
    ],
    columns: [
      ['description', 'Descrição'],
      ['type', 'Tipo'],
      ['amount', 'Valor'],
      ['transactionDate', 'Data'],
    ],
    list: {
      dateLabel: 'Data da movimentação',
      textLabel: 'Descrição ou categoria',
      statuses: [
        ['income', 'Entrada'],
        ['outcome', 'Saída'],
      ],
      totals: (sums) => [
        { label: 'Entradas', value: sums.income ?? 0 },
        { label: 'Saídas', value: sums.outcome ?? 0 },
        { label: 'Saldo', value: sums.balance ?? 0 },
      ],
    },
    isLocked: (row) => Boolean(row.orderId || row.expenseId),
  },
} satisfies Record<string, ResourceConfig>;

export type ResourceKey = keyof typeof resources;

export const MONEY_COLUMNS = new Set(['price', 'cost', 'amount', 'paidAmount', 'initialBalance', 'total']);
