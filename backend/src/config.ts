// Configuração lida do ambiente e validada na inicialização (falha cedo se faltar algo).
import { z } from 'zod';

const emptyAsUndefined = (value: unknown) => (value === '' ? undefined : value);

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
  // Bot do Telegram (etapa 10d). Sem o token, o vínculo fica indisponível. O segredo protege o webhook.
  // Vazio conta como ausente: os testes e2e desligam o bot assim, mesmo com o .env preenchido.
  TELEGRAM_BOT_TOKEN: z.preprocess(emptyAsUndefined, z.string().optional()),
  TELEGRAM_WEBHOOK_SECRET: z.preprocess(
    emptyAsUndefined,
    z
      .string()
      .regex(/^[A-Za-z0-9_-]{16,256}$/, 'Use de 16 a 256 letras, números, _ ou -')
      .optional(),
  ),
  // Anexos do CRM (fotos, vídeos, áudios e arquivos). Em produção, no Supabase Storage: o navegador envia
  // direto para lá (a Vercel aceita só 4,5 MB por requisição). Sem as duas variáveis, em desenvolvimento e
  // nos testes os arquivos ficam no disco (UPLOADS_DIR); em produção, os anexos ficam indisponíveis.
  SUPABASE_URL: z.preprocess(emptyAsUndefined, z.url().optional()),
  SUPABASE_SERVICE_ROLE_KEY: z.preprocess(emptyAsUndefined, z.string().optional()),
  STORAGE_BUCKET: z.string().default('anexos'),
  UPLOADS_DIR: z.string().default('.uploads'),
  // Tamanho máximo de um arquivo e total por empresa, em MB.
  ATTACHMENT_MAX_MB: z.coerce.number().positive().default(50),
  ATTACHMENTS_COMPANY_MAX_MB: z.coerce.number().positive().default(300),
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
