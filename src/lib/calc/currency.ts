import type { Transaction } from "@/db/types";

/**
 * Converte os lançamentos para a moeda base ANTES de qualquer soma.
 *
 * Só o patrimônio (netWorth) convertia; relatórios, orçamentos e fluxo somavam
 * centavos de moedas diferentes como se fossem a mesma coisa — 100 USD virava
 * "100" no gráfico ao lado de 100 BRL. Passar a lista por aqui resolve num
 * ponto só, sem espalhar câmbio por cada função de cálculo.
 *
 * `rate(from)` = quantas unidades da moeda base valem 1 unidade de `from`
 * (mesma convenção de `makeRateFn`). Sem cotação cadastrada o fator é 1, então
 * o comportamento não piora em relação ao de antes.
 *
 * Devolve o MESMO array quando não há nada a converter (caso comum: tudo em
 * BRL), pra não invalidar memo de quem chama.
 */
export function toBaseCurrency(
  transactions: Transaction[],
  baseCurrency: string,
  rate: (currency: string) => number,
): Transaction[] {
  let changed = false;
  const out = transactions.map((t) => {
    const cur = t.currency || baseCurrency;
    if (cur === baseCurrency) return t;
    const factor = rate(cur);
    if (factor === 1) return t;
    changed = true;
    return {
      ...t,
      amountCents: Math.round(t.amountCents * factor),
      currency: baseCurrency,
      splits: t.splits?.map((s) => ({
        ...s,
        amountCents: Math.round(s.amountCents * factor),
        unitAmountCents:
          s.unitAmountCents == null
            ? s.unitAmountCents
            : Math.round(s.unitAmountCents * factor),
      })),
    };
  });
  return changed ? out : transactions;
}
