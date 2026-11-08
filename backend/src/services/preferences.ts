import { type DashboardLayout, dashboardLayoutSchema } from '@arandue/shared/schemas';
import { eq, sql } from 'drizzle-orm';
import { db } from '../db/client.ts';
import { userPreferences } from '../db/schema.ts';
import { authorize, type Ctx } from '../lib/context.ts';
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
