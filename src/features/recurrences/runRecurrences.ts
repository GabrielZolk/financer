import { db } from "@/db/schema";
import { bulkCreate, update } from "@/db/repo";
import { generateDueTransactions } from "@/lib/recurrence";
import type { Recurrence, Transaction } from "@/db/types";

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Gera os lançamentos vencidos de todas as recorrências ativas e avança suas
 * datas. Idempotente por dia: roda no boot e sempre que necessário.
 * Retorna quantos lançamentos foram criados.
 */
export async function runRecurrences(): Promise<number> {
  const all = (await db.recurrences.toArray()) as Recurrence[];
  const active = all.filter((r) => r.deleted === 0 && r.active === 1);
  if (!active.length) return 0;

  const { transactions, updates } = generateDueTransactions(active, todayStr());
  if (!transactions.length && !updates.length) return 0;

  // corrige a moeda de cada lançamento conforme a conta de origem
  const accounts = await db.accounts.toArray();
  const currencyByAccount = new Map(accounts.map((a) => [a.id, a.currency]));

  if (transactions.length) {
    await bulkCreate<Transaction>(
      "transactions",
      transactions.map((t) => ({
        ...t,
        currency: currencyByAccount.get(t.accountId) ?? "BRL",
      })),
    );
  }

  for (const u of updates) {
    await update<Recurrence>("recurrences", u.id, {
      nextDate: u.nextDate,
      active: u.active,
    });
  }

  return transactions.length;
}
