// Schemas de validação compartilhados entre frontend (formulários) e backend (API).
import { z } from 'zod';
import { isValidCnpj, isValidCpf, onlyDigits, STATES } from '../br.ts';
import { isPermission, type Permission } from '../permissions.ts';

// Campo de texto opcional: string vazia vira null (o banco guarda NULL, não '').
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((value) => (value ? value : null));

// E-mail opcional: aceita vazio (vira null) ou um endereço válido.
const optionalEmail = z
  .union([z.literal(''), z.email('E-mail inválido').max(160)])
  .nullish()
  .transform((value) => (value ? value.toLowerCase() : null));

const requiredText = (max: number, message: string) => z.string().trim().min(1, message).max(max);

const money = z
  .number({ error: 'Informe um valor numérico' })
  .nonnegative('O valor não pode ser negativo')
  .max(1e10);
const isoDate = z.iso.date({ error: 'Data inválida (use AAAA-MM-DD)' });
const id = z.number().int().positive();

// ---------- Autenticação e usuários ----------

export const passwordSchema = z
  .string()
  .min(10, 'A senha deve ter pelo menos 10 caracteres')
  .max(128, 'A senha deve ter no máximo 128 caracteres');

export const registerSchema = z.object({
  companyName: requiredText(160, 'Informe o nome da empresa'),
  cnpj: optionalText(18),
  name: requiredText(160, 'Informe seu nome'),
  email: z.email('E-mail inválido').trim().toLowerCase().max(160),
  password: passwordSchema,
});
export type RegisterInput = z.input<typeof registerSchema>;

export const loginSchema = z.object({
  email: z.email('E-mail inválido').trim().toLowerCase(),
  password: z.string().min(1, 'Informe a senha').max(128),
});
export type LoginInput = z.input<typeof loginSchema>;

export const userCreateSchema = z.object({
  name: requiredText(160, 'Informe o nome'),
  email: z.email('E-mail inválido').trim().toLowerCase().max(160),
  groupId: id,
  password: passwordSchema,
});
export type UserCreateInput = z.input<typeof userCreateSchema>;

// E-mail não muda (é o login). Senha vazia mantém a atual.
export const userUpdateSchema = z.object({
  name: requiredText(160, 'Informe o nome'),
  groupId: id,
  active: z.boolean(),
  password: z
    .union([z.literal(''), passwordSchema])
    .nullish()
    .transform((value) => value || null),
});
export type UserUpdateInput = z.input<typeof userUpdateSchema>;

// ---------- Grupos de acesso ----------

export const accessGroupSchema = z.object({
  name: requiredText(80, 'Informe o nome do grupo'),
  description: optionalText(255),
  ownOnly: z.boolean().default(false),
  permissions: z
    .array(
      z.custom<Permission>(
        (value) => typeof value === 'string' && isPermission(value),
        'Permissão desconhecida',
      ),
    )
    .max(200),
});
export type AccessGroupInput = z.input<typeof accessGroupSchema>;

// ---------- Empresa ----------

// Só PNG, JPEG ou WebP em base64: SVG pode carregar script.
export const LOGO_MAX_BYTES = 150 * 1024;
const LOGO_PATTERN = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/;

// Unidade em que a empresa digita largura e comprimento. A quantidade é sempre a área em m².
export const MEASURE_UNITS = ['mm', 'cm', 'm'] as const;
export type MeasureUnit = (typeof MEASURE_UNITS)[number];
const METERS_PER_UNIT: Record<MeasureUnit, number> = { mm: 0.001, cm: 0.01, m: 1 };

export const areaInSquareMeters = (width: number, length: number, unit: MeasureUnit) =>
  Math.round((width * METERS_PER_UNIT[unit] * length * METERS_PER_UNIT[unit] + Number.EPSILON) * 100) / 100;

export const companySettingsSchema = z.object({
  name: requiredText(160, 'Informe o nome da empresa'),
  cnpj: optionalText(18),
  legalName: optionalText(160),
  address: optionalText(255),
  phone: optionalText(30),
  email: optionalEmail,
  logo: z
    .string()
    .max(Math.ceil((LOGO_MAX_BYTES * 4) / 3) + 32, 'O logo deve ter no máximo 150 KB')
    .regex(LOGO_PATTERN, 'Use um logo em PNG, JPEG ou WebP')
    .nullish()
    .transform((value) => value ?? null),
  quoteTerms: optionalText(2000),
  useMeasures: z.boolean().default(false),
  measureUnit: z.enum(MEASURE_UNITS).default('m'),
  // Obrigatório: é a referência do sistema para o acompanhamento do faturamento anual.
  meiAnnualLimit: z
    .number({ error: 'Informe o limite anual do MEI' })
    .positive('O limite anual do MEI deve ser maior que zero')
    .max(1e10),
});
export type CompanySettingsInput = z.input<typeof companySettingsSchema>;

// ---------- Cadastros ----------

// ---------- Pessoas (clientes, fornecedores, transportadoras, representantes) ----------

export const PERSON_KINDS = ['individual', 'company'] as const;
export const TAXPAYER_TYPES = ['contributor', 'exempt', 'non_contributor'] as const;
export const TAX_REGIMES = ['mei', 'simples', 'presumido', 'real'] as const;
export const FREIGHT_TYPES = ['sender', 'recipient', 'none'] as const;
export const ADDRESS_KINDS = ['delivery', 'billing'] as const;
export const PERSON_ROLES = ['customer', 'supplier', 'carrier', 'sales_rep'] as const;
export type PersonRole = (typeof PERSON_ROLES)[number];

const digitsOnly = (max: number) =>
  z
    .string()
    .nullish()
    .transform((value) => onlyDigits(value).slice(0, max) || null);

const state = z
  .union([z.literal(''), z.enum(STATES)])
  .nullish()
  .transform((value) => value || null);

const addressFields = {
  zip: digitsOnly(8),
  street: optionalText(160),
  number: optionalText(20),
  complement: optionalText(80),
  district: optionalText(80),
  city: optionalText(80),
  state,
};

export const personContactSchema = z.object({
  name: requiredText(120, 'Informe o nome do contato'),
  role: optionalText(80),
  phone: optionalText(30),
  email: optionalEmail,
});

export const personAddressSchema = z.object({ kind: z.enum(ADDRESS_KINDS), ...addressFields });

// Papéis ausentes no corpo = mantêm os atuais (na edição) ou ficam desligados (no cadastro).
export const personSchema = z
  .object({
    kind: z.enum(PERSON_KINDS).default('individual'),
    document: digitsOnly(14),
    name: requiredText(160, 'Informe o nome'),
    legalName: optionalText(160),
    isCustomer: z.boolean().optional(),
    isSupplier: z.boolean().optional(),
    isCarrier: z.boolean().optional(),
    isSalesRep: z.boolean().optional(),
    email: optionalEmail,
    phone: optionalText(30),
    mobile: optionalText(30),
    stateRegistration: optionalText(20),
    taxpayer: z.enum(TAXPAYER_TYPES).default('non_contributor'),
    finalConsumer: z.boolean().default(true),
    taxRegime: z
      .union([z.literal(''), z.enum(TAX_REGIMES)])
      .nullish()
      .transform((value) => value || null),
    ...addressFields,
    country: optionalText(60),
    // Comercial
    paymentMethod: optionalText(60),
    paymentTerms: optionalText(120),
    freightType: z
      .union([z.literal(''), z.enum(FREIGHT_TYPES)])
      .nullish()
      .transform((value) => value || null),
    carrierId: id.nullish(),
    category: optionalText(60),
    region: optionalText(60),
    sellerId: id.nullish(),
    creditLimit: money.nullish(),
    notes: optionalText(1000),
    contacts: z.array(personContactSchema).max(30).optional(),
    addresses: z.array(personAddressSchema).max(10).optional(),
  })
  .superRefine((data, issue) => {
    if (!data.document) return;
    const valid = data.kind === 'company' ? isValidCnpj(data.document) : isValidCpf(data.document);
    if (!valid) {
      issue.addIssue({
        code: 'custom',
        path: ['document'],
        message: data.kind === 'company' ? 'CNPJ inválido' : 'CPF inválido',
      });
    }
  });
export type PersonInput = z.input<typeof personSchema>;

export const PRODUCT_TYPES = ['product', 'service'] as const;
// Unidade em que o produto é vendido e contado no estoque.
export const PRODUCT_UNITS = ['UN', 'CX', 'KG', 'L', 'M', 'M2'] as const;

export const productSchema = z.object({
  name: requiredText(120, 'Informe o nome'),
  type: z.enum(PRODUCT_TYPES),
  price: money,
  cost: money.nullish(),
  stock: z.number().nonnegative('O estoque não pode ser negativo').max(1e9).nullish(),
  unit: z.enum(PRODUCT_UNITS).default('UN'),
  groupName: optionalText(80),
  minStock: z.number().nonnegative('O estoque mínimo não pode ser negativo').max(1e9).nullish(),
});
export type ProductInput = z.input<typeof productSchema>;

// Agenda: tarefas e compromissos manuais. Os demais itens (próximas ações, validades e vencimentos)
// vêm dos próprios documentos.
const timeOfDay = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Hora inválida (use HH:MM)');
export const agendaEventSchema = z.object({
  title: requiredText(160, 'Informe o título'),
  date: isoDate,
  time: timeOfDay.nullish(),
  notes: optionalText(500),
  done: z.boolean().default(false),
});
export type AgendaEventInput = z.input<typeof agendaEventSchema>;
export const AGENDA_KINDS = ['task', 'opportunity', 'quote', 'receivable', 'payable'] as const;
export type AgendaKind = (typeof AGENDA_KINDS)[number];
export const agendaQuerySchema = z
  .object({ from: isoDate, to: isoDate })
  .refine(({ from, to }) => from <= to, 'O início deve vir antes do fim.')
  .refine(
    ({ from, to }) => (Date.parse(to) - Date.parse(from)) / 86_400_000 <= 92,
    'Escolha um período de até 92 dias.',
  );

// Relatórios: período opcional, aplicado na data principal de cada relatório.
export const reportQuerySchema = z.object({
  from: isoDate.optional(),
  to: isoDate.optional(),
});
export type ReportQuery = z.input<typeof reportQuerySchema>;

// Listas paginadas no servidor: página, período, status e texto, todos opcionais.
export const PAGE_SIZES = [25, 50, 100] as const;
export const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(100_000).default(1),
  pageSize: z.coerce
    .number()
    .int()
    .refine((value) => (PAGE_SIZES as readonly number[]).includes(value), 'Tamanho de página inválido.')
    .default(25),
  from: isoDate.optional(),
  to: isoDate.optional(),
  status: z.string().trim().max(30).optional(),
  q: z.string().trim().max(120).optional(),
});
export type ListQuery = z.output<typeof listQuerySchema>;
export interface ListPage<T> {
  rows: T[];
  total: number;
  page: number;
  pageSize: number;
  // Somas sobre todos os registros do filtro, não só da página.
  totals: Record<string, number>;
}

// Listas da empresa: valores sugeridos nos formulários, que continuam aceitando digitar outro.
export const LIST_KINDS = [
  'payment_method',
  'payment_terms',
  'opportunity_source',
  'lost_reason',
  'customer_category',
  'contact_role',
  'financial_category',
  'product_group',
] as const;
export type ListKind = (typeof LIST_KINDS)[number];
export const listItemSchema = z.object({
  kind: z.enum(LIST_KINDS),
  name: requiredText(80, 'Informe o nome'),
});
export type ListItemInput = z.input<typeof listItemSchema>;
export const listItemUpdateSchema = z.object({
  name: requiredText(80, 'Informe o nome'),
  active: z.boolean(),
});
export type ListItemUpdateInput = z.input<typeof listItemUpdateSchema>;

// Condições de pagamento da empresa: entrada em % (paga no dia do documento) e prazos em dias a partir
// dele. No orçamento e no pedido, a condição escolhida gera as parcelas, que continuam editáveis.
export const paymentConditionSchema = z
  .object({
    name: requiredText(80, 'Informe o nome'),
    downPaymentPercent: z
      .number()
      .min(0, 'A entrada não pode ser negativa')
      .max(100, 'A entrada vai até 100%')
      .default(0),
    downPaymentMethod: optionalText(40),
    days: z
      .array(z.number().int('Use dias inteiros').min(0, 'O prazo não pode ser negativo').max(3650))
      .max(60, 'No máximo 60 parcelas')
      .default([]),
    method: optionalText(40),
    active: z.boolean().default(true),
  })
  .refine((data) => data.downPaymentPercent > 0 || data.days.length > 0, {
    message: 'Informe a entrada ou ao menos um prazo',
  })
  .refine((data) => data.downPaymentPercent < 100 || data.days.length === 0, {
    message: 'Com entrada de 100%, não há prazos',
  })
  .refine((data) => data.days.every((day, index) => index === 0 || day > (data.days[index - 1] ?? -1)), {
    message: 'Os prazos devem estar em ordem crescente, sem repetir',
  });
export type PaymentConditionInput = z.input<typeof paymentConditionSchema>;
export type PaymentCondition = z.output<typeof paymentConditionSchema>;

const addDaysIso = (iso: string, days: number) =>
  new Date(Date.parse(`${iso}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

// Parcelas da condição para um total. Conta em centavos: a sobra do arredondamento fica na primeira
// parcela depois da entrada, e a soma fecha com o total.
export function conditionInstallments(
  condition: Pick<PaymentCondition, 'downPaymentPercent' | 'downPaymentMethod' | 'days' | 'method'>,
  total: number,
  baseDate: string,
) {
  const cents = Math.round(total * 100);
  const down = condition.days.length ? Math.round((cents * condition.downPaymentPercent) / 100) : cents;
  const rest = cents - down;
  const count = condition.days.length;
  const part = count ? Math.floor(rest / count) : 0;
  const rows: { dueDate: string; amount: number; method: string | null }[] = [];
  if (down > 0) {
    rows.push({
      dueDate: baseDate,
      amount: down / 100,
      method: condition.downPaymentMethod ?? condition.method ?? null,
    });
  }
  condition.days.forEach((day, index) => {
    rows.push({
      dueDate: addDaysIso(baseDate, day),
      amount: (index === 0 ? part + (rest - part * count) : part) / 100,
      method: condition.method ?? null,
    });
  });
  return rows;
}

// Biblioteca de textos: cláusulas e trechos prontos para o orçamento.
export const textSnippetSchema = z.object({
  title: requiredText(80, 'Informe o título'),
  body: requiredText(2000, 'Informe o texto'),
  active: z.boolean().default(true),
});
export type TextSnippetInput = z.input<typeof textSnippetSchema>;

// Modelo de grupo: itens com quantidade e, opcionalmente, o preço combinado. Sem preço, vale o do
// cadastro na hora de inserir.
export const itemTemplateSchema = z.object({
  name: requiredText(80, 'Informe o nome do modelo'),
  items: z
    .array(
      z.object({
        productId: id,
        quantity: z.number().positive('A quantidade deve ser maior que zero').max(1e6),
        unitPrice: money.nullish(),
      }),
    )
    .min(1, 'O modelo precisa de ao menos um item')
    .max(100),
  active: z.boolean().default(true),
});
export type ItemTemplateInput = z.input<typeof itemTemplateSchema>;

// Ajuste de estoque: entrada, saída ou contagem (o saldo passa a ser a quantidade informada).
export const STOCK_ADJUSTMENT_KINDS = ['in', 'out', 'count'] as const;
export const stockAdjustmentSchema = z.object({
  kind: z.enum(STOCK_ADJUSTMENT_KINDS),
  quantity: z.number().nonnegative('A quantidade não pode ser negativa').max(1e9),
  reason: requiredText(255, 'Informe o motivo do ajuste'),
});
export type StockAdjustmentInput = z.input<typeof stockAdjustmentSchema>;

// ---------- Financeiro ----------

export const ACCOUNT_TYPES = ['checking', 'savings', 'cash'] as const;

export const bankAccountSchema = z.object({
  bankName: requiredText(100, 'Informe a instituição'),
  accountName: requiredText(120, 'Informe o nome da conta'),
  accountType: z.enum(ACCOUNT_TYPES),
  initialBalance: z.number().min(-1e10).max(1e10),
});
export type BankAccountInput = z.input<typeof bankAccountSchema>;

export const EXPENSE_STATUSES = ['pending', 'paid'] as const;

export const expenseSchema = z.object({
  description: requiredText(180, 'Informe a descrição'),
  category: requiredText(80, 'Informe a categoria'),
  amount: money,
  expenseDate: isoDate,
  status: z.enum(EXPENSE_STATUSES),
  bankAccountId: id.nullish(),
  supplierId: id.nullish(),
});
export type ExpenseInput = z.input<typeof expenseSchema>;

export const TRANSACTION_TYPES = ['income', 'outcome'] as const;

export const transactionSchema = z.object({
  type: z.enum(TRANSACTION_TYPES),
  category: requiredText(80, 'Informe a categoria'),
  description: requiredText(180, 'Informe a descrição'),
  amount: money,
  transactionDate: isoDate,
  bankAccountId: id.nullish(),
});
export type TransactionInput = z.input<typeof transactionSchema>;

// ---------- Vendas ----------

export const ORDER_STATUSES = ['pending', 'paid', 'completed', 'cancelled'] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

// Parcela combinada no orçamento ou no pedido. No pedido, cada uma vira uma conta a receber.
export const quoteInstallmentSchema = z.object({
  dueDate: isoDate,
  amount: z
    .number()
    .positive('O valor da parcela deve ser maior que zero')
    .max(1e10)
    // Fica em JSON, sem o arredondamento da coluna numérica do banco.
    .refine((value) => Math.abs(value * 100 - Math.round(value * 100)) < 1e-6, {
      message: 'O valor da parcela deve ter no máximo duas casas decimais',
    }),
  method: optionalText(40),
});
export type QuoteInstallment = z.output<typeof quoteInstallmentSchema>;

export const orderItemSchema = z.object({
  productId: id,
  quantity: z.number().positive('A quantidade deve ser maior que zero').max(1e6),
  unitPrice: money.optional(),
});

export const orderCreateSchema = z.object({
  opportunityId: id.nullish(),
  customerId: id.nullish(),
  orderDate: isoDate,
  status: z.enum(['pending', 'paid']).default('pending'),
  discount: money.default(0),
  freight: money.default(0),
  otherCharges: money.default(0),
  notes: optionalText(500),
  bankAccountId: id.nullish(),
  items: z.array(orderItemSchema).min(1, 'Inclua ao menos um item').max(100),
  // Só em pedido pendente. Sem parcelas, o pedido tem uma única conta, com vencimento na data da venda.
  installments: z.array(quoteInstallmentSchema).max(60).default([]),
});
export type OrderCreateInput = z.input<typeof orderCreateSchema>;

export const orderUpdateSchema = z.object({
  customerId: id.nullish(),
  orderDate: isoDate.optional(),
  status: z.enum(ORDER_STATUSES).optional(),
  discount: money.optional(),
  notes: optionalText(500).optional(),
  bankAccountId: id.nullish(),
  // Obrigatório ao cancelar (conferido no servidor, que sabe o status anterior).
  reason: optionalText(255).optional(),
});
export type OrderUpdateInput = z.input<typeof orderUpdateSchema>;

// Baixa de um pedido pendente pelo contas a receber (vira "pago" e entra no caixa).
export const receivableSettleSchema = z.object({
  bankAccountId: id.nullish(),
  settledOn: isoDate.optional(),
});
export type ReceivableSettleInput = z.input<typeof receivableSettleSchema>;

// Desfazer uma baixa exige a senha de quem está logado e o motivo, que fica no histórico.
export const passwordConfirmationSchema = z.object({
  password: z.string().min(1, 'Informe a sua senha').max(128),
  reason: requiredText(255, 'Informe o motivo'),
});
export const orderUndoPaymentsSchema = passwordConfirmationSchema.extend({
  action: z.enum(['cancel', 'pending', 'delete']),
});

const cents = money.refine((value) => Math.abs(value * 100 - Math.round(value * 100)) < 1e-6, {
  message: 'O valor deve ter no máximo duas casas decimais',
});

// Baixa em uma ou mais contas. Sem valor recebido, quita o saldo (mais juros, menos desconto).
export const receivablesSettleSchema = z.object({
  bankAccountId: id.nullish(),
  settledOn: isoDate.optional(),
  method: optionalText(40),
  notes: optionalText(255),
  items: z
    .array(
      z.object({
        receivableId: id,
        received: cents.optional(),
        interest: cents.default(0),
        discount: cents.default(0),
      }),
    )
    .min(1, 'Selecione ao menos uma conta')
    .max(100, 'Selecione no máximo 100 contas')
    .refine((items) => new Set(items.map((item) => item.receivableId)).size === items.length, {
      message: 'A mesma conta foi informada mais de uma vez',
    }),
});
export type ReceivablesSettleInput = z.input<typeof receivablesSettleSchema>;

export const QUOTE_STATUSES = ['draft', 'sent', 'approved', 'rejected', 'cancelled'] as const;
export type QuoteStatus = (typeof QUOTE_STATUSES)[number];

const measure = z.number().positive('A medida deve ser maior que zero').max(1e5).nullish();

// Item de orçamento: pode ter grupo (ambiente, etapa, kit) e medidas. Com medidas, a quantidade é a
// área em m², calculada no servidor.
export const quoteItemSchema = orderItemSchema
  .extend({
    groupName: optionalText(80),
    width: measure,
    length: measure,
    measureUnit: z.enum(MEASURE_UNITS).nullish(),
    // Entra no total, mas não sai no espelho do cliente.
    hiddenInMirror: z.boolean().default(false),
  })
  .refine((item) => !item.width === !item.length, {
    message: 'Informe a largura e o comprimento, ou deixe os dois em branco',
  })
  .refine(
    (item) =>
      !item.width ||
      !item.length ||
      areaInSquareMeters(item.width, item.length, item.measureUnit ?? 'm') >= 0.01,
    {
      message: 'As medidas resultam em uma área pequena demais',
    },
  );

// Criação e edição (só em rascunho) usam o mesmo formato; o status muda por ações próprias.
export const quoteSchema = z.object({
  // Só no cadastro; depois, o vínculo muda pelas rotas de vincular e desvincular.
  opportunityId: id.nullish(),
  customerId: id.nullish(),
  validUntil: isoDate.nullish(),
  discount: money.default(0),
  freight: money.default(0),
  otherCharges: money.default(0),
  notes: optionalText(500),
  internalNotes: optionalText(500),
  siteDescription: optionalText(160),
  siteContact: optionalText(160),
  siteAddress: optionalText(255),
  // Vazio: o espelho usa o texto padrão da empresa.
  clauses: optionalText(4000),
  items: z.array(quoteItemSchema).min(1, 'Inclua ao menos um item').max(100),
  // A soma é conferida no servidor, que calcula o total.
  installments: z.array(quoteInstallmentSchema).max(60).default([]),
});
export type QuoteInput = z.input<typeof quoteSchema>;

// Recusar e cancelar exigem o motivo, que fica no histórico.
export const documentReasonSchema = z.object({ reason: requiredText(255, 'Informe o motivo') });
export type DocumentReasonInput = z.input<typeof documentReasonSchema>;

export const quoteConvertSchema = z.object({
  orderDate: isoDate,
  status: z.enum(['pending', 'paid']).default('pending'),
  bankAccountId: id.nullish(),
});
export type QuoteConvertInput = z.input<typeof quoteConvertSchema>;

// Duplicar ou copiar para pedido: o pedido novo precisa da data da venda.
export const copyToOrderSchema = z.object({ orderDate: isoDate, keepOpportunity: z.boolean().default(true) });
export type CopyToOrderInput = z.input<typeof copyToOrderSchema>;

// ---------- CRM ----------

export const OPPORTUNITY_STATUSES = ['open', 'won', 'lost'] as const;
export type OpportunityStatus = (typeof OPPORTUNITY_STATUSES)[number];
export const STAGE_MILESTONES = ['start', 'quote_sent', 'negotiation'] as const;
export type StageMilestone = (typeof STAGE_MILESTONES)[number];
export const CHANNELS = ['web', 'telegram', 'whatsapp', 'phone', 'in_person'] as const;
// "event" é só para registros automáticos; o usuário escolhe entre estes.
export const ACTIVITY_KINDS = ['comment', 'call', 'visit', 'meeting', 'proposal', 'email'] as const;

export const opportunityItemSchema = z.object({
  productId: id,
  quantity: z.number().positive('A quantidade deve ser maior que zero').max(1e6),
  unitPrice: money.nullish(),
});

export const opportunitySchema = z.object({
  title: requiredText(160, 'Informe o título da oportunidade'),
  customerId: id.nullish(),
  contactName: optionalText(160),
  contactPhone: optionalText(30),
  contactEmail: optionalEmail,
  source: requiredText(60, 'Informe a origem (ex.: Indicação, Instagram)'),
  // Só no cadastro; depois, a etapa muda pela rota própria.
  stageId: id.nullish(),
  estimatedValue: money.nullish(),
  expectedCloseDate: isoDate.nullish(),
  // Responsável; vazio = quem cadastrou.
  ownerId: id.nullish(),
  nextAction: optionalText(255),
  nextActionAt: isoDate.nullish(),
  items: z.array(opportunityItemSchema).max(100).optional(),
});
export type OpportunityInput = z.input<typeof opportunitySchema>;

export const opportunityStageSchema = z.object({ stageId: id });
export type OpportunityStageInput = z.input<typeof opportunityStageSchema>;

export const opportunityStatusSchema = z
  .object({ status: z.enum(OPPORTUNITY_STATUSES), lostReason: optionalText(255) })
  .refine((data) => data.status !== 'lost' || data.lostReason, {
    message: 'Informe o motivo da perda',
    path: ['lostReason'],
  });
export type OpportunityStatusInput = z.input<typeof opportunityStatusSchema>;

export const interactionSchema = z.object({
  kind: z.enum(ACTIVITY_KINDS).default('comment'),
  channel: z.enum(CHANNELS).default('web'),
  description: requiredText(2000, 'Descreva o atendimento'),
});
export type InteractionInput = z.input<typeof interactionSchema>;

// Tela geral de auditoria. O período vem como instante, já no fuso de quem consulta.
export const historyFilterSchema = z.object({
  userId: z.coerce.number().int().positive().optional(),
  module: z.string().trim().max(60).optional(),
  action: z
    .enum(['create', 'update', 'status', 'convert', 'archive', 'delete', 'login', 'export'])
    .optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  page: z.coerce.number().int().positive().default(1),
});
export type HistoryFilterInput = z.input<typeof historyFilterSchema>;

export const opportunityFilterSchema = z.object({
  status: z.enum(OPPORTUNITY_STATUSES).optional(),
  stageId: z.coerce.number().int().positive().optional(),
  ownerId: z.coerce.number().int().positive().optional(),
  source: z.string().trim().max(60).optional(),
  lostReason: z.string().trim().max(100).optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
  q: z.string().trim().max(100).optional(),
});
export type OpportunityFilter = z.output<typeof opportunityFilterSchema>;

export const pipelineStageSchema = z.object({
  name: requiredText(60, 'Informe o nome da etapa'),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, 'Cor inválida')
    .default('#6d4fd6'),
  milestone: z
    .union([z.literal(''), z.enum(STAGE_MILESTONES)])
    .nullish()
    .transform((value) => value || null),
});
export type PipelineStageInput = z.input<typeof pipelineStageSchema>;

export const pipelineOrderSchema = z.object({ ids: z.array(id).min(1).max(50) });
export type PipelineOrderInput = z.input<typeof pipelineOrderSchema>;

// Vincular um documento a uma oportunidade (null desvincula).
export const documentLinkSchema = z.object({ opportunityId: id.nullable() });
export type DocumentLinkInput = z.input<typeof documentLinkSchema>;

export const duplicateQuoteSchema = z.object({ keepOpportunity: z.boolean().default(true) });
export type DuplicateQuoteInput = z.input<typeof duplicateQuoteSchema>;

export const TRACE_TYPES = ['opportunity', 'quote', 'order'] as const;

export const idParamSchema = z.object({ id: z.coerce.number().int().positive() });
