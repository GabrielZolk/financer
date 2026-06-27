import type { Transaction } from "@/db/types";
import type { Cents } from "@/lib/money";

export interface CashflowSummary {
  income: Cents;
  expense: Cents;
  net: Cents;
}

function inRange(date: string, from?: string, to?: string): boolean {
  if (from && date < from) return false;
  if (to && date > to) return false;
  return true;
}

/**
 * Fluxo de caixa (entradas x saídas) num período.
 * Transferências NÃO contam como receita/despesa (só movem entre contas).
 */
export function cashflow(
  transactions: Transaction[],
  from?: string,
  to?: string,
  opts: { includePending?: boolean } = {},
): CashflowSummary {
  let income = 0;
  let expense = 0;
  for (const tx of transactions) {
    if (tx.deleted) continue;
    if (!opts.includePending && tx.status === "pending") continue;
    if (!inRange(tx.date, from, to)) continue;
    if (tx.kind === "income") income += tx.amountCents;
    else if (tx.kind === "expense") expense += tx.amountCents;
  }
  return { income, expense, net: income - expense };
}

export interface CategoryTotal {
  categoryId: string | null;
  total: Cents;
}

/** Total por categoria (despesas por padrão) num período, ordenado desc. */
export function totalsByCategory(
  transactions: Transaction[],
  kind: "income" | "expense",
  from?: string,
  to?: string,
): CategoryTotal[] {
  const map = new Map<string | null, Cents>();
  for (const tx of transactions) {
    if (tx.deleted || tx.status === "pending") continue;
    if (tx.kind !== kind) continue;
    if (!inRange(tx.date, from, to)) continue;
    if (tx.splits?.length) {
      // lançamento dividido: atribui cada parte à sua categoria
      for (const s of tx.splits) {
        map.set(s.categoryId, (map.get(s.categoryId) ?? 0) + s.amountCents);
      }
    } else {
      map.set(tx.categoryId, (map.get(tx.categoryId) ?? 0) + tx.amountCents);
    }
  }
  return [...map.entries()]
    .map(([categoryId, total]) => ({ categoryId, total }))
    .sort((a, b) => b.total - a.total);
}

export interface MonthlyPoint {
  month: string; // YYYY-MM
  income: Cents;
  expense: Cents;
  net: Cents;
}

/** Série mensal de receita/despesa/saldo para gráficos de evolução. */
export function monthlySeries(transactions: Transaction[]): MonthlyPoint[] {
  const map = new Map<string, { income: Cents; expense: Cents }>();
  for (const tx of transactions) {
    if (tx.deleted || tx.status === "pending") continue;
    if (tx.kind === "transfer") continue;
    const month = tx.date.slice(0, 7);
    const entry = map.get(month) ?? { income: 0, expense: 0 };
    if (tx.kind === "income") entry.income += tx.amountCents;
    else entry.expense += tx.amountCents;
    map.set(month, entry);
  }
  return [...map.entries()]
    .map(([month, v]) => ({
      month,
      income: v.income,
      expense: v.expense,
      net: v.income - v.expense,
    }))
    .sort((a, b) => a.month.localeCompare(b.month));
}
