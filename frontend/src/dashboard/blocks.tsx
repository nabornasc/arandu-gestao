import type { Permission } from '@arandue/shared/permissions';
import type { DashboardSize } from '@arandue/shared/schemas';
import {
  ArrowDownCircle,
  ArrowUpCircle,
  CircleDollarSign,
  ClipboardList,
  FileClock,
  HandCoins,
  Scale,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { EmptyState } from '../components/EmptyState.tsx';
import { MetricCard } from '../components/MetricCard.tsx';
import { navigation } from '../config/navigation.ts';
import { can, type Profile } from '../lib/auth.ts';
import { formatCode, formatDate, formatMoney, label } from '../lib/format.ts';

export interface DashboardData {
  revenueMonth: number;
  expensesMonth: number;
  balance: number;
  pendingOrders: number;
  revenueYear: number;
  meiAnnualLimit: number | null;
  recentOrders: {
    id: number;
    number: number;
    orderDate: string;
    total: number;
    status: string;
    customerName: string | null;
  }[];
  lowStock: { id: number; name: string; stock: number; minStock: number; unit: string }[];
  // Vêm vazios (null) para quem não pode ver o módulo de origem.
  receivables: { open: number; overdue: number } | null;
  quotesAwaiting: { count: number; total: number } | null;
  salesByMonth: { month: string; total: number }[] | null;
  topProducts: { name: string; quantity: number; total: number }[] | null;
  crm: { open: number; openValue: number; wonMonth: number; wonMonthValue: number } | null;
}

export interface BlockProps {
  data: DashboardData;
  size: DashboardSize;
  profile: Profile;
}

export interface BlockDefinition {
  id: string;
  title: string;
  sizes: DashboardSize[];
  // Permissão de quem vê; o bloco também some quando o servidor não manda o dado.
  permission?: Permission;
  available?: (data: DashboardData) => boolean;
  render: (props: BlockProps) => ReactNode;
}

const quantity = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 });
const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

function Panel({ title, children, link }: { title: string; children: ReactNode; link?: [string, string] }) {
  return (
    <section className="panel dashboard-panel" aria-label={title}>
      <div className="panel-heading">
        <h3>{title}</h3>
        {link && (
          <Link className="link-button" to={link[0]}>
            {link[1]}
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}

// Barras em CSS: sem biblioteca de gráficos, e o valor de cada mês fica no texto para leitor de tela.
function SalesChart({ data }: BlockProps) {
  const series = data.salesByMonth ?? [];
  const max = Math.max(...series.map((row) => row.total), 1);
  return (
    <Panel title="Vendas por mês" link={['/pedidos', 'Ver pedidos']}>
      <ol className="bar-chart" aria-label="Vendas dos últimos 12 meses">
        {series.map((row) => {
          const month = MONTHS[Number(row.month.slice(5)) - 1] ?? row.month;
          return (
            <li key={row.month} title={`${month}/${row.month.slice(2, 4)}: ${formatMoney(row.total)}`}>
              <span className="bar" style={{ height: `${Math.max(2, (row.total / max) * 100)}%` }} />
              <span className="bar-label">{month}</span>
              <span className="sr-only">{formatMoney(row.total)}</span>
            </li>
          );
        })}
      </ol>
    </Panel>
  );
}

function TopProducts({ data }: BlockProps) {
  const rows = data.topProducts ?? [];
  const max = Math.max(...rows.map((row) => row.total), 1);
  return (
    <Panel title="Mais vendidos (90 dias)">
      {rows.length ? (
        <ol className="ranking">
          {rows.map((row) => (
            <li key={row.name}>
              <div>
                <strong>{row.name}</strong>
                <span>
                  {quantity.format(row.quantity)} un. · {formatMoney(row.total)}
                </span>
              </div>
              <span className="ranking-bar" style={{ width: `${(row.total / max) * 100}%` }} />
            </li>
          ))}
        </ol>
      ) : (
        <EmptyState text="Nenhuma venda nos últimos 90 dias." />
      )}
    </Panel>
  );
}

function RecentOrders({ data }: BlockProps) {
  return (
    <Panel title="Últimos pedidos" link={['/pedidos', 'Ver todos']}>
      {data.recentOrders.length ? (
        <div className="order-list">
          {data.recentOrders.map((order) => (
            <div className="order-row" key={order.id}>
              <div className="order-symbol">{formatCode(order.number)}</div>
              <div className="order-info">
                <strong>{order.customerName ?? 'Cliente não informado'}</strong>
                <small>{formatDate(order.orderDate)}</small>
              </div>
              <span className={`status ${order.status}`}>{label(order.status)}</span>
              <strong>{formatMoney(order.total)}</strong>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState text="Nenhum pedido cadastrado ainda." />
      )}
    </Panel>
  );
}

function LowStock({ data }: BlockProps) {
  return (
    <section className="panel low-stock dashboard-panel" aria-labelledby="titulo-estoque-baixo">
      <div className="panel-heading">
        <div>
          <h3 id="titulo-estoque-baixo">Estoque baixo</h3>
          <p>Produtos que chegaram no estoque mínimo. Reponha ou ajuste o mínimo no cadastro.</p>
        </div>
        <Link className="link-button" to="/produtos">
          Ver produtos
        </Link>
      </div>
      {data.lowStock.length ? (
        <ul className="low-stock-list">
          {data.lowStock.map((product) => (
            <li key={product.id}>
              <strong>{product.name}</strong>
              <span>
                {quantity.format(product.stock)} {product.unit} · mínimo {quantity.format(product.minStock)}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState text="Nenhum produto no estoque mínimo." />
      )}
    </section>
  );
}

function MeiLimit({ data }: BlockProps) {
  const used = data.meiAnnualLimit ? data.revenueYear / data.meiAnnualLimit : null;
  return (
    <Panel title="Limite anual do MEI">
      {used === null ? (
        <p>Limite não configurado. Informe em Configurações.</p>
      ) : (
        <div className="result-line mei-limit">
          <span>Faturamento do ano em relação ao limite</span>
          <strong className={used >= 1 ? 'negative' : undefined}>
            {Math.round(used * 100)}% · {formatMoney(data.revenueYear)} de {formatMoney(data.meiAnnualLimit)}
          </strong>
          <meter min={0} max={1} low={0.6} high={0.8} optimum={0} value={Math.min(used, 1)}>
            {Math.round(used * 100)}%
          </meter>
        </div>
      )}
    </Panel>
  );
}

function Crm({ data }: BlockProps) {
  const crm = data.crm;
  if (!crm) return null;
  return (
    <Panel title="CRM" link={['/crm', 'Abrir CRM']}>
      <dl className="dashboard-facts">
        <div>
          <dt>Oportunidades abertas</dt>
          <dd>
            {crm.open} · {formatMoney(crm.openValue)}
          </dd>
        </div>
        <div>
          <dt>Ganhas no mês</dt>
          <dd>
            {crm.wonMonth} · {formatMoney(crm.wonMonthValue)}
          </dd>
        </div>
      </dl>
    </Panel>
  );
}

function QuickAccess({ profile }: BlockProps) {
  const actions = navigation.flatMap((item) =>
    item.create && can(profile, item.create.permission) ? [item.create] : [],
  );
  return (
    <Panel title="Acesso rápido">
      {actions.length ? (
        <div className="quick-actions">
          {actions.map((action) => (
            <Link key={action.path} className="button secondary" to={action.path}>
              {action.label}
            </Link>
          ))}
        </div>
      ) : (
        <EmptyState text="Seu grupo não cria registros." />
      )}
    </Panel>
  );
}

function Impact({ data }: BlockProps) {
  const result = data.revenueMonth - data.expensesMonth;
  return (
    <section className="panel impact-panel dashboard-panel" aria-label="Resultado do mês">
      <div className="impact-icon" aria-hidden="true">
        🌱
      </div>
      <span className="welcome-label">ODS 1 · ERRADICAÇÃO DA POBREZA</span>
      <h3>Pequenas decisões, grandes caminhos.</h3>
      <p>
        Quando o microempreendedor organiza seu caixa e precifica com clareza, ganha sustentabilidade e renda
        para prosperar a longo prazo.
      </p>
      <div className="result-line">
        <span>Resultado do mês (faturamento − despesas)</span>
        <strong className={result >= 0 ? 'positive' : 'negative'}>{formatMoney(result)}</strong>
      </div>
    </section>
  );
}

const SMALL: DashboardSize[] = ['S', 'M'];
const WIDE: DashboardSize[] = ['M', 'L'];

export const BLOCKS: BlockDefinition[] = [
  {
    id: 'revenue_month',
    title: 'Faturamento do mês',
    sizes: SMALL,
    render: ({ data }) => (
      <MetricCard
        icon={ArrowUpCircle}
        label="Faturamento do mês"
        value={formatMoney(data.revenueMonth)}
        tone="green"
        helper="Pedidos pagos ou concluídos"
      />
    ),
  },
  {
    id: 'expenses_month',
    title: 'Despesas pagas no mês',
    sizes: SMALL,
    render: ({ data }) => (
      <MetricCard
        icon={ArrowDownCircle}
        label="Despesas pagas no mês"
        value={formatMoney(data.expensesMonth)}
        tone="red"
        helper="Saídas confirmadas"
      />
    ),
  },
  {
    id: 'balance',
    title: 'Saldo atual',
    sizes: SMALL,
    render: ({ data }) => (
      <MetricCard
        icon={CircleDollarSign}
        label="Saldo atual"
        value={formatMoney(data.balance)}
        tone="purple"
        helper="Contas ativas + movimentações"
      />
    ),
  },
  {
    id: 'pending_orders',
    title: 'Pedidos pendentes',
    sizes: SMALL,
    render: ({ data }) => (
      <MetricCard
        icon={ClipboardList}
        label="Pedidos pendentes"
        value={data.pendingOrders}
        tone="yellow"
        helper="Aguardando recebimento"
      />
    ),
  },
  {
    id: 'receivables_open',
    title: 'A receber em aberto',
    sizes: SMALL,
    available: (data) => data.receivables !== null,
    render: ({ data }) => (
      <MetricCard
        icon={HandCoins}
        label="A receber em aberto"
        value={formatMoney(data.receivables?.open)}
        tone="green"
        helper={`Vencido: ${formatMoney(data.receivables?.overdue)}`}
      />
    ),
  },
  {
    id: 'quotes_awaiting',
    title: 'Orçamentos aguardando',
    sizes: SMALL,
    available: (data) => data.quotesAwaiting !== null,
    render: ({ data }) => (
      <MetricCard
        icon={FileClock}
        label="Orçamentos aguardando"
        value={data.quotesAwaiting?.count ?? 0}
        tone="purple"
        helper={`Enviados, sem resposta: ${formatMoney(data.quotesAwaiting?.total)}`}
      />
    ),
  },
  {
    id: 'month_result',
    title: 'Resultado do mês',
    sizes: SMALL,
    render: ({ data }) => (
      <MetricCard
        icon={Scale}
        label="Resultado do mês"
        value={formatMoney(data.revenueMonth - data.expensesMonth)}
        tone={data.revenueMonth >= data.expensesMonth ? 'green' : 'red'}
        helper="Faturamento − despesas"
      />
    ),
  },
  { id: 'low_stock', title: 'Estoque baixo', sizes: WIDE, permission: 'products.read', render: LowStock },
  {
    id: 'sales_chart',
    title: 'Vendas por mês',
    sizes: WIDE,
    available: (data) => data.salesByMonth !== null,
    render: SalesChart,
  },
  {
    id: 'top_products',
    title: 'Mais vendidos',
    sizes: WIDE,
    available: (data) => data.topProducts !== null,
    render: TopProducts,
  },
  { id: 'recent_orders', title: 'Últimos pedidos', sizes: WIDE, render: RecentOrders },
  { id: 'crm', title: 'CRM', sizes: WIDE, available: (data) => data.crm !== null, render: Crm },
  { id: 'mei_limit', title: 'Limite anual do MEI', sizes: WIDE, render: MeiLimit },
  { id: 'quick_access', title: 'Acesso rápido', sizes: ['S', 'M', 'L'], render: QuickAccess },
  { id: 'impact', title: 'Resultado do mês e ODS', sizes: WIDE, render: Impact },
];

export const DEFAULT_LAYOUT: { id: string; size: DashboardSize }[] = [
  { id: 'revenue_month', size: 'S' },
  { id: 'expenses_month', size: 'S' },
  { id: 'balance', size: 'S' },
  { id: 'pending_orders', size: 'S' },
  { id: 'low_stock', size: 'L' },
  { id: 'sales_chart', size: 'M' },
  { id: 'top_products', size: 'M' },
  { id: 'recent_orders', size: 'M' },
  { id: 'impact', size: 'M' },
];
