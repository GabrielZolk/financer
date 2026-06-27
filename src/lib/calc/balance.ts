import type { Account, Transaction } from "@/db/types";
import type { Cents } from "@/lib/money";

/**
 * Efeito líquido de uma transação sobre o saldo de UMA conta.
 * - receita: entra na conta de origem
 * - despesa: sai da conta de origem
 * - transferência: sai da origem, entra no destino
 */
export function transactionEffectOn(tx: Transaction, accountId: string): Cents {
  if (tx.deleted) return 0;
  const amt = tx.amountCents;
  switch (tx.kind) {
    case "income":
      return tx.accountId === accountId ? amt : 0;
    case "expense":
      return tx.accountId === accountId ? -amt : 0;
    case "transfer": {
      let v = 0;
      if (tx.accountId === accountId) v -= amt;
      if (tx.toAccountId === accountId) v += amt;
      return v;
    }
    default:
      return 0;
  }
}

export interface BalanceOptions {
  /** se true, considera também lançamentos pendentes (saldo projetado) */
  includePending?: boolean;
  /** considera apenas lançamentos até esta data (YYYY-MM-DD), inclusive */
  upToDate?: string;
}

/** Saldo de uma conta = saldo inicial + efeito das transações. */
export function accountBalance(
  account: Account,
  transactions: Transaction[],
  opts: BalanceOptions = {},
): Cents {
  let balance = account.initialBalanceCents;
  for (const tx of transactions) {
    if (tx.deleted) continue;
    if (!opts.includePending && tx.status === "pending") continue;
    if (opts.upToDate && tx.date > opts.upToDate) continue;
    balance += transactionEffectOn(tx, account.id);
  }
  return balance;
}

/** Mapa accountId -> saldo (uma única passada por todas as transações). */
export function balancesByAccount(
  accounts: Account[],
  transactions: Transaction[],
  opts: BalanceOptions = {},
): Map<string, Cents> {
  const map = new Map<string, Cents>();
  for (const acc of accounts) map.set(acc.id, acc.initialBalanceCents);
  for (const tx of transactions) {
    if (tx.deleted) continue;
    if (!opts.includePending && tx.status === "pending") continue;
    if (opts.upToDate && tx.date > opts.upToDate) continue;
    if (map.has(tx.accountId)) {
      map.set(
        tx.accountId,
        (map.get(tx.accountId) ?? 0) + transactionEffectOn(tx, tx.accountId),
      );
    }
    if (tx.kind === "transfer" && tx.toAccountId && map.has(tx.toAccountId)) {
      map.set(
        tx.toAccountId,
        (map.get(tx.toAccountId) ?? 0) +
          transactionEffectOn(tx, tx.toAccountId),
      );
    }
  }
  return map;
}

/**
 * Patrimônio líquido consolidado, convertendo cada conta para a moeda base.
 * `rate(from)` retorna quantas unidades da moeda base equivalem a 1 unidade de `from`.
 */
export function netWorth(
  accounts: Account[],
  transactions: Transaction[],
  baseCurrency: string,
  rate: (currency: string) => number,
  opts: BalanceOptions = {},
): Cents {
  const balances = balancesByAccount(accounts, transactions, opts);
  let total = 0;
  for (const acc of accounts) {
    if (acc.archived) continue;
    const bal = balances.get(acc.id) ?? 0;
    const factor = acc.currency === baseCurrency ? 1 : rate(acc.currency);
    total += Math.round(bal * factor);
  }
  return total;
}
