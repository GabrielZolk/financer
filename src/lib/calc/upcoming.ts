/**
 * Próximos vencimentos (lembretes): recorrências ativas + faturas de cartão
 * que vencem dentro do horizonte. Função pura, testável.
 */
import type { Account, Recurrence, Transaction } from "@/db/types";
import type { Cents } from "@/lib/money";
import { currentInvoice } from "./creditcard";

export interface DueItem {
  date: string; // YYYY-MM-DD
  label: string;
  amountCents: Cents;
  kind: "recurrence" | "invoice";
  /** receita/despesa/transferência (só pra recorrências) */
  flow?: Recurrence["kind"];
}

/** Soma `days` dias a uma data YYYY-MM-DD. */
export function addDaysStr(date: string, days: number): string {
  const d = new Date(date + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function upcomingDue(
  recurrences: Recurrence[],
  accounts: Account[],
  transactions: Transaction[],
  today = new Date().toISOString().slice(0, 10),
  horizonDays = 14,
): DueItem[] {
  const limit = addDaysStr(today, horizonDays);
  const items: DueItem[] = [];

  for (const r of recurrences) {
    if (r.active !== 1 || r.deleted) continue;
    if (r.nextDate >= today && r.nextDate <= limit) {
      items.push({
        date: r.nextDate,
        label: r.description,
        amountCents: r.amountCents,
        kind: "recurrence",
        flow: r.kind,
      });
    }
  }

  for (const a of accounts) {
    if (a.type !== "credit_card" || a.archived) continue;
    const inv = currentInvoice(a, transactions, today);
    if (inv && inv.totalCents > 0 && inv.dueDate >= today && inv.dueDate <= limit) {
      items.push({
        date: inv.dueDate,
        label: `Fatura ${a.name}`,
        amountCents: inv.totalCents,
        kind: "invoice",
      });
    }
  }

  return items.sort((a, b) => a.date.localeCompare(b.date));
}
