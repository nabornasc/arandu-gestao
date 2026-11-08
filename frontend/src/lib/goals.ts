export interface GoalRow {
  target: number | null;
  achieved: number;
}

export interface Goals {
  month: string;
  company: GoalRow;
  sellers: (GoalRow & { userId: number; name: string })[];
}

// Quanto da meta já foi vendido, em fração (0,5 = metade). Sem meta, null.
export const progressOf = ({ target, achieved }: GoalRow) => (target ? achieved / target : null);

// Projeção para o fim do mês, no ritmo de vendas até hoje. Mês passado já fechou; mês futuro não tem ritmo.
export function projection(month: string, achieved: number, today = new Date()) {
  const [year = 0, monthNumber = 1] = month.split('-').map(Number);
  const days = new Date(year, monthNumber, 0).getDate();
  const current = today.getFullYear() === year && today.getMonth() + 1 === monthNumber;
  if (!current) return null;
  return Math.round((achieved / today.getDate()) * days * 100) / 100;
}
