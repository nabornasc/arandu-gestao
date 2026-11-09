import type { AiUsage } from './provider.ts';

// Preço em dólar por milhão de tokens (tabela da Anthropic de 10/2026). Gravar no cache custa 1,25x a
// entrada; ler do cache, a fração indicada. Atualize quando a tabela mudar: o custo gravado em ai_usage
// é o que a cota de cada empresa soma.
const PRICES: Record<string, { input: number; output: number; cacheRead: number }> = {
  'claude-haiku-5-5': { input: 0.1, output: 0.5, cacheRead: 0.01 },
  'claude-sonnet-5-5': { input: 2, output: 10, cacheRead: 0.2 },
  'claude-opus-5-5': { input: 4, output: 20, cacheRead: 0.2 },
};
// Modelo fora da tabela: cobra como o mais caro, para a cota nunca ficar por baixo.
const FALLBACK = { input: 10, output: 50, cacheRead: 1 };

const MILLION = 1_000_000;

export function costUsd(model: string, usage: AiUsage): number {
  const price = PRICES[model] ?? FALLBACK;
  return (
    (usage.inputTokens * price.input +
      usage.cacheWriteTokens * price.input * 1.25 +
      usage.cacheReadTokens * price.cacheRead +
      usage.outputTokens * price.output) /
    MILLION
  );
}
