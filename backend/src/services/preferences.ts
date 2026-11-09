import {
  type DashboardLayout,
  dashboardLayoutSchema,
  LIST_KEYS,
  listColumnsSchema,
} from '@arandue/shared/schemas';
import { eq, sql } from 'drizzle-orm';
import { db } from '../db/client.ts';
import { userPreferences } from '../db/schema.ts';
import { authorize, type Ctx } from '../lib/context.ts';
import { badRequest } from '../lib/errors.ts';
import { parse } from '../lib/validate.ts';

// Layout do dashboard de quem está logado. null: a tela usa o padrão.
export async function getDashboardLayout(ctx: Ctx): Promise<DashboardLayout | null> {
  authorize(ctx, 'analytics.read');
  const [row] = await db
    .select({ dashboard: userPreferences.dashboard })
    .from(userPreferences)
    .where(eq(userPreferences.userId, ctx.userId));
  return row?.dashboard ?? null;
}

// Cada usuário mexe só no próprio layout; null volta ao padrão.
export async function saveDashboardLayout(ctx: Ctx, input: unknown): Promise<DashboardLayout | null> {
  authorize(ctx, 'analytics.read');
  const data = input === null ? null : parse(dashboardLayoutSchema, input);
  await db
    .insert(userPreferences)
    .values({ userId: ctx.userId, dashboard: data })
    .onConflictDoUpdate({ target: userPreferences.userId, set: { dashboard: data, updatedAt: sql`now()` } });
  return data;
}

// Colunas escondidas de cada lista, de quem está logado. Vale para qualquer usuário: é só a tela dele.
export async function getListColumns(ctx: Ctx): Promise<Record<string, string[]>> {
  const [row] = await db
    .select({ listColumns: userPreferences.listColumns })
    .from(userPreferences)
    .where(eq(userPreferences.userId, ctx.userId));
  return row?.listColumns ?? {};
}

// Troca só a lista informada; as outras listas e o layout da visão geral ficam como estão.
export async function saveListColumns(ctx: Ctx, list: string, input: unknown): Promise<string[]> {
  if (!(LIST_KEYS as readonly string[]).includes(list)) throw badRequest('Lista desconhecida.');
  const { hidden } = parse(listColumnsSchema, input);
  const patch = JSON.stringify({ [list]: hidden });
  await db
    .insert(userPreferences)
    .values({ userId: ctx.userId, listColumns: { [list]: hidden } })
    .onConflictDoUpdate({
      target: userPreferences.userId,
      set: {
        listColumns: sql`coalesce(${userPreferences.listColumns}, '{}'::jsonb) || ${patch}::jsonb`,
        updatedAt: sql`now()`,
      },
    });
  return hidden;
}
