import type { Permission } from '@arandue/shared/permissions';
import {
  Banknote,
  Boxes,
  Calculator,
  CalendarDays,
  ChartColumn,
  CircleDollarSign,
  ClipboardList,
  Factory,
  FileText,
  HandCoins,
  History,
  LayoutDashboard,
  type LucideIcon,
  Receipt,
  Settings,
  ShieldCheck,
  SquareKanban,
  Target,
  Truck,
  UserCog,
  Users,
} from 'lucide-react';

// Fica separado de resources.ts para o menu não puxar os schemas (zod) para o pacote inicial.
export type ModuleKey = 'inicio' | 'vendas' | 'financeiro' | 'cadastros' | 'gestao' | 'administracao';

export interface NavItem {
  path: string;
  label: string;
  icon: LucideIcon;
  // Permissão necessária para ver o item.
  permission: Permission;
  module: ModuleKey;
  // Frase curta para os blocos da página do módulo.
  description: string;
  // Atalho de criação mostrado no bloco, para quem tem a permissão.
  create?: { path: string; label: string; permission: Permission };
}

// Módulos do menu. Os que têm página de entrada aparecem como link no menu lateral.
export const MODULES: { key: ModuleKey; label: string; page: boolean }[] = [
  { key: 'inicio', label: 'Início', page: false },
  { key: 'vendas', label: 'Vendas', page: true },
  { key: 'financeiro', label: 'Financeiro', page: true },
  { key: 'cadastros', label: 'Cadastros', page: true },
  { key: 'gestao', label: 'Gestão', page: true },
  { key: 'administracao', label: 'Administração', page: true },
];
export const modulePath = (key: ModuleKey) => `/modulo/${key}`;

// Etapas do fluxo de venda, mostradas com setas na página de Vendas.
export const SALES_FLOW = ['/crm', '/orcamentos', '/pedidos', '/contas-a-receber'];

// O menu mostra só os itens que o grupo do usuário pode ver (o backend é quem garante).
export const navigation: NavItem[] = [
  {
    path: '/',
    label: 'Visão geral',
    icon: LayoutDashboard,
    permission: 'analytics.read',
    module: 'inicio',
    description: 'Resumo do mês, limite do MEI e últimos pedidos.',
  },
  {
    path: '/agenda',
    label: 'Agenda',
    icon: CalendarDays,
    permission: 'agenda.read',
    module: 'inicio',
    description: 'Tarefas, próximas ações, validades e vencimentos.',
  },
  {
    path: '/crm',
    label: 'CRM',
    icon: SquareKanban,
    permission: 'opportunities.read',
    module: 'vendas',
    description: 'Oportunidades do primeiro contato até a venda.',
    create: { path: '/crm/novo', label: 'Nova oportunidade', permission: 'opportunities.create' },
  },
  {
    path: '/orcamentos',
    label: 'Orçamentos',
    icon: FileText,
    permission: 'quotes.read',
    module: 'vendas',
    description: 'Propostas enviadas ao cliente, com espelho para imprimir.',
    create: { path: '/orcamentos/novo', label: 'Novo orçamento', permission: 'quotes.create' },
  },
  {
    path: '/pedidos',
    label: 'Vendas e pedidos',
    icon: ClipboardList,
    permission: 'orders.read',
    module: 'vendas',
    description: 'Vendas fechadas, que baixam o estoque e geram as contas a receber.',
    create: { path: '/pedidos/novo', label: 'Novo pedido', permission: 'orders.create' },
  },
  {
    path: '/contas-a-receber',
    label: 'Contas a receber',
    icon: HandCoins,
    permission: 'receivables.read',
    module: 'financeiro',
    description: 'Parcelas dos pedidos, com baixa parcial, juros e desconto.',
  },
  {
    path: '/despesas',
    label: 'Contas a pagar',
    icon: Receipt,
    permission: 'payables.read',
    module: 'financeiro',
    description: 'Despesas do negócio, com fornecedor e vencimento.',
  },
  {
    path: '/contas',
    label: 'Contas bancárias',
    icon: Banknote,
    permission: 'bank_accounts.read',
    module: 'financeiro',
    description: 'Caixa e contas, com saldo inicial.',
  },
  {
    path: '/movimentacoes',
    label: 'Movimentações',
    icon: CircleDollarSign,
    permission: 'cash.read',
    module: 'financeiro',
    description: 'Entradas e saídas de todas as contas.',
  },
  {
    path: '/produtos',
    label: 'Produtos e serviços',
    icon: Boxes,
    permission: 'products.read',
    module: 'cadastros',
    description: 'Catálogo com preço, custo, grupo e estoque.',
  },
  {
    path: '/clientes',
    label: 'Clientes',
    icon: Users,
    permission: 'customers.read',
    module: 'cadastros',
    description: 'Cadastro e ficha de cada cliente.',
    create: { path: '/clientes/novo', label: 'Novo cliente', permission: 'customers.create' },
  },
  {
    path: '/fornecedores',
    label: 'Fornecedores',
    icon: Factory,
    permission: 'suppliers.read',
    module: 'cadastros',
    description: 'Quem fornece mercadorias e serviços.',
    create: { path: '/fornecedores/novo', label: 'Novo fornecedor', permission: 'suppliers.create' },
  },
  {
    path: '/transportadoras',
    label: 'Transportadoras',
    icon: Truck,
    permission: 'suppliers.read',
    module: 'cadastros',
    description: 'Quem faz as entregas.',
    create: { path: '/transportadoras/novo', label: 'Nova transportadora', permission: 'suppliers.create' },
  },
  {
    path: '/metas',
    label: 'Metas de venda',
    icon: Target,
    permission: 'analytics.read',
    module: 'gestao',
    description: 'Meta do mês para a empresa e cada vendedor, com o que já foi vendido.',
  },
  {
    path: '/precificacao',
    label: 'Precificação',
    icon: Calculator,
    permission: 'costs.read',
    module: 'gestao',
    description: 'Preço sugerido pelo custo, despesas fixas, custos da venda e margem desejada.',
  },
  {
    path: '/relatorios',
    label: 'Relatórios',
    icon: ChartColumn,
    permission: 'reports.read',
    module: 'gestao',
    description: 'Vendas, financeiro, estoque e formação de preço, com exportação em CSV.',
  },
  {
    path: '/auditoria',
    label: 'Auditoria',
    icon: History,
    permission: 'audit.read',
    module: 'gestao',
    description: 'Quem fez o quê e quando, em todos os módulos.',
  },
  {
    path: '/usuarios',
    label: 'Usuários',
    icon: UserCog,
    permission: 'users.read',
    module: 'administracao',
    description: 'Pessoas da equipe e o grupo de cada uma.',
  },
  {
    path: '/grupos',
    label: 'Grupos de acesso',
    icon: ShieldCheck,
    permission: 'access.manage',
    module: 'administracao',
    description: 'O que cada grupo pode ver e fazer.',
  },
  {
    path: '/configuracoes',
    label: 'Configurações',
    icon: Settings,
    permission: 'settings.read',
    module: 'administracao',
    description: 'Dados da empresa, limite do MEI e listas.',
  },
];

export const SETTINGS_PATH = '/configuracoes';
