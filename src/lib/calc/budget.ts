import type { Budget, Transaction } from "@/db/types";
import type { Cents } from "@/lib/money";

export interface BudgetStatus {
  categoryId: string;
  month: string;
  limitCents: Cents;
  spentCents: Cents;
  remainingCents: Cents;
  /** 0..1 (pode passar de 1 quando estoura) */
  ratio: number;
  /** true quando o gasto ultrapassou o limite */
  overBudget: boolean;
}

/**
 * Resolve os orçamentos EFETIVOS de um mês:
 * - orçamentos recorrentes valem do seu `month` em diante (pega o mais recente
 *   por categoria com month <= alvo);
 * - um orçamento explícito (não-recorrente) do próprio mês sobrescreve.
 * Retorna cada orçamento com `month` ajustado pro mês alvo (pra calcular o
 * gasto do mês certo), mas preservando `id`/`limitCents`/`recurring` do registro.
 */
export function resolveBudgets(all: Budget[], month: string): Budget[] {
  const byCat = new Map<string, Budget>();
  for (const b of all) {
    if (b.deleted || b.recurring !== 1 || b.month > month) continue;
    const cur = byCat.get(b.categoryId);
    if (!cur || b.month > cur.month) byCat.set(b.categoryId, b);
  }
  for (const b of all) {
    if (b.deleted || b.recurring === 1 || b.month !== month) continue;
    byCat.set(b.categoryId, b);
  }
  return [...byCat.values()].map((b) => ({ ...b, month }));
}

/** Quanto foi gasto numa categoria num mês (apenas despesas efetivadas). */
export function spentInCategory(
  transactions: Transaction[],
  categoryId: string,
  month: string,
): Cents {
  let total = 0;
  for (const tx of transactions) {
    if (tx.deleted || tx.status === "pending") continue;
    if (tx.kind !== "expense") continue;
    if (tx.date.slice(0, 7) !== month) continue;
    if (tx.splits?.length) {
      for (const s of tx.splits) {
        if (s.categoryId === categoryId) total += s.amountCents;
      }
    } else if (tx.categoryId === categoryId) {
      total += tx.amountCents;
    }
  }
  return total;
}

/** Situação de um orçamento (gasto, restante, % e flag de estouro). */
export function budgetStatus(
  budget: Budget,
  transactions: Transaction[],
): BudgetStatus {
  const spent = spentInCategory(transactions, budget.categoryId, budget.month);
  const remaining = budget.limitCents - spent;
  const ratio = budget.limitCents > 0 ? spent / budget.limitCents : 0;
  return {
    categoryId: budget.categoryId,
    month: budget.month,
    limitCents: budget.limitCents,
    spentCents: spent,
    remainingCents: remaining,
    ratio,
    overBudget: spent > budget.limitCents,
  };
}

export function budgetStatuses(
  budgets: Budget[],
  transactions: Transaction[],
): BudgetStatus[] {
  return budgets.map((b) => budgetStatus(b, transactions));
}
