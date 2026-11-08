// Formação de preço por markup divisor: o preço precisa cobrir o custo do item, a parte das despesas
// fixas que cabe a cada venda (rateio), os custos que variam com a venda (taxa de cartão, comissão,
// embalagem) e a margem de lucro desejada, todos em % do preço.

export interface PricingInput {
  // Custo unitário do produto.
  cost: number;
  // Despesas fixas por mês e faturamento médio por mês: definem o rateio.
  fixedExpenses: number;
  monthlyRevenue: number;
  // Em % do preço de venda.
  variablePercent: number;
  marginPercent: number;
}

const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

// Parte das despesas fixas em cada venda, em % do faturamento. Sem faturamento, não há como ratear.
export const overheadPercent = (fixedExpenses: number, monthlyRevenue: number) =>
  monthlyRevenue > 0 ? round2((fixedExpenses / monthlyRevenue) * 100) : 0;

// Resultado de um preço: lucro, margem de contribuição e ponto de equilíbrio.
export function pricingResult(input: Omit<PricingInput, 'marginPercent'>, price: number) {
  const overhead = overheadPercent(input.fixedExpenses, input.monthlyRevenue);
  const variable = (price * input.variablePercent) / 100;
  // O que sobra de cada venda para pagar as despesas fixas e dar lucro.
  const contribution = round2(price - input.cost - variable);
  const contributionPercent = price > 0 ? round2((contribution / price) * 100) : 0;
  const profit = round2(contribution - (price * overhead) / 100);
  return {
    price: round2(price),
    overheadPercent: overhead,
    profit,
    marginPercent: price > 0 ? round2((profit / price) * 100) : 0,
    contribution,
    contributionPercent,
    // Faturamento mensal que paga todas as despesas fixas, com lucro zero.
    breakEvenRevenue:
      contributionPercent > 0 ? round2(input.fixedExpenses / (contributionPercent / 100)) : null,
    // Quantas unidades deste item, sozinho, pagariam as despesas fixas do mês.
    breakEvenUnits: contribution > 0 ? Math.ceil(input.fixedExpenses / contribution) : null,
  };
}

// Preço sugerido: custo ÷ (1 − rateio − variáveis − margem). Acima de 100%, não existe preço possível.
export function suggestPrice(input: PricingInput) {
  const overhead = overheadPercent(input.fixedExpenses, input.monthlyRevenue);
  const divisor = 1 - (overhead + input.variablePercent + input.marginPercent) / 100;
  if (divisor <= 0) {
    return {
      ok: false as const,
      overheadPercent: overhead,
      message: 'A soma do rateio, dos custos variáveis e da margem chega a 100% do preço. Reduza a margem.',
    };
  }
  return { ok: true as const, ...pricingResult(input, input.cost / divisor) };
}
