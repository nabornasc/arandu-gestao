// Configuração lida do ambiente e validada na inicialização (falha cedo se faltar algo).
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3001),
  DATABASE_URL: z.url(),
  // Assistente de IA. Sem a chave, o assistente responde que não está disponível.
  ANTHROPIC_API_KEY: z.string().optional(),
  AI_PROVIDER: z.enum(['anthropic', 'fake']).default('anthropic'),
  AI_MODEL: z.string().default('claude-haiku-5-5'),
  // Cotação usada para converter o custo em dólar; ajuste quando o câmbio mudar muito.
  AI_USD_BRL: z.coerce.number().positive().default(5.5),
  // Teto do mês somando todas as empresas: protege a conta da Anthropic.
  AI_PLATFORM_MONTHLY_BRL: z.coerce.number().positive().default(1000),
  // Maior cota mensal que uma empresa pode escolher em Configurações (ela pode baixar, nunca passar disto).
  AI_COMPANY_MAX_QUOTA_BRL: z.coerce.number().positive().default(200),
  ALLOWED_ORIGINS: z
    .string()
    .default('http://localhost:5173')
    .transform((value) =>
      value
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean),
    ),
});

export const config = envSchema.parse(process.env);
export const isProduction = config.NODE_ENV === 'production';
