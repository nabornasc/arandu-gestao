import { pricingResult, suggestPrice } from '@arandue/shared/pricing';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useId, useState } from 'react';
import { EmptyState } from '../components/EmptyState.tsx';
import { useToast } from '../components/Toast.tsx';
import { api } from '../lib/api.ts';
import { can, useProfile } from '../lib/auth.ts';
import { formatDate, formatMoney } from '../lib/format.ts';

interface PricingBase {
  months: number;
  from: string | null;
  to: string | null;
  monthlyRevenue: number;
  expenses: { category: string; monthly: number }[];
}

interface ProductRow {
  id: number;
  name: string;
  type: 'product' | 'service';
  price: number;
  cost: number | null;
  unit: string;
  groupName: string | null;
  minStock: number | null;
}

// Compras de mercadoria variam com as vendas: entram no custo do produto, não no rateio.
const VARIABLE_CATEGORY = /mercadoria|compra|estoque|insumo/i;

const percent = (value: number) => `${value.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`;
const number = (text: string) => Number(text.replace(',', '.')) || 0;

export default function PricingPage() {
  const base = useQuery({ queryKey: ['/pricing/base'], queryFn: () => api<PricingBase>('/pricing/base') });
  return (
    <section>
      <div className="section-heading page-heading">
        <div>
          <span className="welcome-label">GESTÃO</span>
          <h2>Precificação</h2>
          <p>
            Preço sugerido a partir do custo, das despesas fixas, dos custos da venda e da margem desejada.
          </p>
        </div>
      </div>
      {base.isPending ? (
        <div className="loading">Carregando...</div>
      ) : base.isError ? (
        <EmptyState text={base.error.message} />
      ) : (
        <PricingForm base={base.data} />
      )}
    </section>
  );
}

function PricingForm({ base }: { base: PricingBase }) {
  const profile = useProfile();
  const notify = useToast();
  const client = useQueryClient();
  const formId = useId();
  const products = useQuery({ queryKey: ['/products'], queryFn: () => api<ProductRow[]>('/products') });
  const [productId, setProductId] = useState('');
  const [cost, setCost] = useState('');
  const [fixed, setFixed] = useState<ReadonlySet<string>>(
    () =>
      new Set(
        base.expenses.filter((row) => !VARIABLE_CATEGORY.test(row.category)).map((row) => row.category),
      ),
  );
  const [otherFixed, setOtherFixed] = useState('0');
  const [revenue, setRevenue] = useState(String(base.monthlyRevenue));
  const [variable, setVariable] = useState('0');
  const [margin, setMargin] = useState('20');

  const product = products.data?.find((row) => String(row.id) === productId);
  const fixedExpenses =
    base.expenses.filter((row) => fixed.has(row.category)).reduce((sum, row) => sum + row.monthly, 0) +
    number(otherFixed);
  const input = {
    cost: number(cost),
    fixedExpenses,
    monthlyRevenue: number(revenue),
    variablePercent: number(variable),
    marginPercent: number(margin),
  };
  const suggestion = suggestPrice(input);
  const current = product && product.price > 0 ? pricingResult(input, product.price) : null;

  const apply = useMutation({
    mutationFn: (price: number) => {
      if (!product) throw new Error('Escolha um produto.');
      // Sem o estoque: mudar o preço não mexe no saldo.
      const { id, name, type, cost: productCost, unit, groupName, minStock } = product;
      return api(`/products/${id}`, {
        method: 'PUT',
        body: { name, type, price, cost: productCost, unit, groupName, minStock },
      });
    },
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['/products'] });
      notify('Preço do produto atualizado.');
    },
    onError: (error) => notify(error.message, 'error'),
  });

  const toggle = (category: string, on: boolean) =>
    setFixed((current) => {
      const next = new Set(current);
      if (on) next.add(category);
      else next.delete(category);
      return next;
    });

  return (
    <div className="pricing">
      <form
        className="panel form-grid"
        onSubmit={(event) => event.preventDefault()}
        aria-labelledby={`${formId}-t`}
      >
        <h3 id={`${formId}-t`} className="full-row">
          Dados
        </h3>
        <label className="full-row">
          Produto (opcional)
          <select
            name="productId"
            value={productId}
            onChange={(event) => {
              setProductId(event.target.value);
              const chosen = products.data?.find((row) => String(row.id) === event.target.value);
              if (chosen?.cost !== null && chosen?.cost !== undefined) setCost(String(chosen.cost));
            }}
          >
            <option value="">Calcular sem produto</option>
            {products.data?.map((row) => (
              <option key={row.id} value={row.id}>
                {row.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Custo unitário (R$)
          <input
            name="cost"
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            value={cost}
            onChange={(event) => setCost(event.target.value)}
          />
        </label>
        <label>
          Faturamento médio por mês (R$)
          <input
            name="revenue"
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            value={revenue}
            onChange={(event) => setRevenue(event.target.value)}
          />
        </label>
        <label>
          Custos da venda (% do preço)
          <input
            name="variablePercent"
            type="number"
            inputMode="decimal"
            min="0"
            max="100"
            step="0.01"
            value={variable}
            onChange={(event) => setVariable(event.target.value)}
          />
        </label>
        <label>
          Margem de lucro desejada (%)
          <input
            name="marginPercent"
            type="number"
            inputMode="decimal"
            min="0"
            max="100"
            step="0.01"
            value={margin}
            onChange={(event) => setMargin(event.target.value)}
          />
        </label>
        <p className="muted full-row">
          Custos da venda: taxa de cartão, comissão, embalagem, impostos sobre a venda. O faturamento e as
          despesas abaixo são a média de{' '}
          {base.from && base.to
            ? `${formatDate(base.from)} a ${formatDate(base.to)}`
            : `${base.months} meses`}
          .
        </p>

        <fieldset className="full-row pricing-expenses">
          <legend>Despesas fixas por mês</legend>
          {base.expenses.length ? (
            base.expenses.map((row) => (
              <label key={row.category} className="checkbox">
                <input
                  type="checkbox"
                  name="fixedCategory"
                  checked={fixed.has(row.category)}
                  onChange={(event) => toggle(row.category, event.target.checked)}
                />
                {`${row.category}: ${formatMoney(row.monthly)}`}
              </label>
            ))
          ) : (
            <p className="muted">Nenhuma despesa paga nos últimos meses.</p>
          )}
          <label>
            Outras despesas fixas (R$ por mês)
            <input
              name="otherFixed"
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              value={otherFixed}
              onChange={(event) => setOtherFixed(event.target.value)}
            />
          </label>
          <p>
            Total: <strong>{formatMoney(fixedExpenses)}</strong> por mês
          </p>
        </fieldset>
      </form>

      <section className="panel pricing-result" aria-label="Resultado">
        <h3>Preço sugerido</h3>
        {suggestion.ok ? (
          <>
            <p className="pricing-price">{formatMoney(suggestion.price)}</p>
            <dl>
              <dt>Rateio das despesas fixas</dt>
              <dd>{percent(suggestion.overheadPercent)} do preço</dd>
              <dt>Lucro por unidade</dt>
              <dd>
                {formatMoney(suggestion.profit)} ({percent(suggestion.marginPercent)})
              </dd>
              <dt>Margem de contribuição</dt>
              <dd>
                {formatMoney(suggestion.contribution)} ({percent(suggestion.contributionPercent)})
              </dd>
              <dt>Ponto de equilíbrio</dt>
              <dd>
                {suggestion.breakEvenRevenue === null
                  ? '—'
                  : `${formatMoney(suggestion.breakEvenRevenue)} por mês`}
                {suggestion.breakEvenUnits !== null &&
                  ` ou ${suggestion.breakEvenUnits} unidades só deste item`}
              </dd>
            </dl>
            {product && can(profile, 'products.update') && (
              <button
                type="button"
                className="button primary"
                disabled={apply.isPending || suggestion.price === product.price}
                onClick={() => apply.mutate(suggestion.price)}
              >
                Aplicar {formatMoney(suggestion.price)} a {product.name}
              </button>
            )}
          </>
        ) : (
          <p className="form-error" role="alert">
            {suggestion.message}
          </p>
        )}

        {product && current && (
          <div className="pricing-current">
            <h4>Preço atual: {formatMoney(product.price)}</h4>
            <p className={current.profit < 0 ? 'negative' : undefined}>
              {current.profit < 0 ? 'Prejuízo' : 'Lucro'} de {formatMoney(Math.abs(current.profit))} por
              unidade ({percent(current.marginPercent)})
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
