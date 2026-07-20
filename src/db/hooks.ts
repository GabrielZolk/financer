import { useLiveQuery } from "dexie-react-hooks";
import { db } from "./schema";
import type { Account, Category, Goal, Transaction } from "./types";
import { usePrivacy, mergeForTotals, isListed } from "@/lib/privacy";

const notDeleted = <T extends { deleted: 0 | 1 }>(arr: T[]) =>
  arr.filter((x) => x.deleted === 0);

export function useGoals(): Goal[] {
  return useLiveQuery(async () => notDeleted(await db.goals.toArray()), [], []);
}

export function useAccounts(includeArchived = false): Account[] {
  return useLiveQuery(
    async () => {
      const all = notDeleted(await db.accounts.toArray());
      const filtered = includeArchived ? all : all.filter((a) => !a.archived);
      return filtered.sort((a, b) => a.order - b.order);
    },
    [includeArchived],
    [],
  );
}

export function useAccount(id: string | undefined): Account | undefined {
  return useLiveQuery(
    () => (id ? db.accounts.get(id) : undefined),
    [id],
    undefined,
  );
}

export function useCategories(kind?: "income" | "expense"): Category[] {
  return useLiveQuery(
    async () => {
      let all = notDeleted(await db.categories.toArray());
      if (kind) all = all.filter((c) => c.kind === kind);
      return all.sort((a, b) => a.order - b.order);
    },
    [kind],
    [],
  );
}

export interface TransactionFilter {
  from?: string;
  to?: string;
  accountId?: string;
  categoryId?: string;
  kind?: Transaction["kind"];
  search?: string;
  tag?: string;
}

export function useTransactions(filter: TransactionFilter = {}): Transaction[] {
  const { from, to, accountId, categoryId, kind, search, tag } = filter;
  const { mode, version } = usePrivacy();
  return useLiveQuery(
    async () => {
      // decifra privados (quando destravado) e esconde-os fora do modo "full"
      let all = mergeForTotals(notDeleted(await db.transactions.toArray())).filter(
        (t) => isListed(t, mode),
      );
      if (from) all = all.filter((t) => t.date >= from);
      if (to) all = all.filter((t) => t.date <= to);
      if (accountId)
        all = all.filter(
          (t) => t.accountId === accountId || t.toAccountId === accountId,
        );
      if (categoryId) all = all.filter((t) => t.categoryId === categoryId);
      if (kind) all = all.filter((t) => t.kind === kind);
      if (tag)
        all = all.filter(
          (t) =>
            t.tags.includes(tag) ||
            t.splits?.some((s) => s.tags?.includes(tag)),
        );
      if (search) {
        const q = search.toLowerCase();
        all = all.filter(
          (t) =>
            t.description.toLowerCase().includes(q) ||
            t.notes?.toLowerCase().includes(q) ||
            t.tags.some((tag) => tag.toLowerCase().includes(q)),
        );
      }
      return all.sort((a, b) =>
        a.date === b.date
          ? b.createdAt.localeCompare(a.createdAt)
          : b.date.localeCompare(a.date),
      );
    },
    [from, to, accountId, categoryId, kind, search, tag, mode, version],
    [],
  );
}

/** Universo de tags já usadas (em transações e em itens de divisão), ordenado. */
export function useAllTags(): string[] {
  return useLiveQuery(
    async () => {
      const set = new Set<string>();
      for (const t of notDeleted(await db.transactions.toArray())) {
        t.tags?.forEach((x) => set.add(x));
        t.splits?.forEach((s) => s.tags?.forEach((x) => set.add(x)));
      }
      return [...set].sort((a, b) => a.localeCompare(b, "pt-BR"));
    },
    [],
    [],
  );
}

/**
 * Todas as transações não-deletadas (para cálculos globais como saldo).
 * Privados são decifrados quando destravado (entram nos totais nos modos
 * partial/full); quando travado ficam como "casca" (valor 0 → fora dos totais).
 */
export function useAllTransactions(): Transaction[] {
  const { version } = usePrivacy();
  return useLiveQuery(
    async () => mergeForTotals(notDeleted(await db.transactions.toArray())),
    [version],
    [],
  );
}
