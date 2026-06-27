/**
 * Cálculos de metas (puros, testáveis). Uma meta pode ser "lastreada" por
 * vários potes (contas) — ex.: um cofrinho + o limite garantido do cartão.
 * O quanto está guardado = soma dos saldos desses potes (sempre em sincronia).
 * Sem potes, cai no número manual `savedCents` (modo "só acompanhar").
 */
import type { Goal } from "@/db/types";
import type { Cents } from "@/lib/money";

/** Potes (contas) vinculados à meta, com fallback pro modelo antigo de 1 conta. */
export function goalPotes(goal: Goal): string[] {
  if (goal.accountIds && goal.accountIds.length) return goal.accountIds;
  if (goal.accountId) return [goal.accountId];
  return [];
}

/**
 * Quanto está guardado na meta:
 * - com potes: soma dos saldos das contas vinculadas;
 * - sem potes: o número manual `savedCents`.
 */
export function goalSaved(goal: Goal, balances: Map<string, Cents>): Cents {
  const potes = goalPotes(goal);
  if (!potes.length) return goal.savedCents;
  return potes.reduce((s, id) => s + (balances.get(id) ?? 0), 0);
}
