import type { Transaction } from "@/db/types";
import type { Cents } from "@/lib/money";
import { totalsByCategory, type CategoryTotal } from "./cashflow";

/** id sintético do agrupador de gastos privados censurados. */
export const PRIVATE_BUCKET = "__private__";

export interface SpendingBreakdown {
  /** categorias públicas (e, no modo "full", também as privadas reais) */
  items: CategoryTotal[];
  /** soma dos gastos privados quando censurados (0 fora do parcial/locked) */
  privateTotal: Cents;
  /** total geral de gastos (públicos + privados somados) */
  total: Cents;
}

/**
 * Gasto por categoria respeitando a privacidade:
 * - "full": mostra as categorias reais (inclusive privadas).
 * - "partial"/"locked": só categorias públicas; os privados viram um único
 *   bloco censurado (PRIVATE_BUCKET) — entram no total, sem expor nome/valor.
 *   (No "locked" os privados são cascas de valor 0, então privateTotal = 0.)
 */
export function spendingBreakdown(
  transactions: Transaction[],
  from: string | undefined,
  to: string | undefined,
  mode: "full" | "partial" | "locked",
): SpendingBreakdown {
  if (mode === "full") {
    const items = totalsByCategory(transactions, "expense", from, to);
    return {
      items,
      privateTotal: 0,
      total: items.reduce((s, t) => s + t.total, 0),
    };
  }
  const publicTxs = transactions.filter((t) => t.private !== 1);
  const privateTxs = transactions.filter((t) => t.private === 1);
  const items = totalsByCategory(publicTxs, "expense", from, to);
  const privateTotal = totalsByCategory(privateTxs, "expense", from, to).reduce(
    (s, t) => s + t.total,
    0,
  );
  return {
    items,
    privateTotal,
    total: items.reduce((s, t) => s + t.total, 0) + privateTotal,
  };
}
