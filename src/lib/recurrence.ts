import { addDays, addMonths, addWeeks, addYears, parseISO, format } from "date-fns";
import type { Recurrence, RecurrenceFrequency, Transaction } from "@/db/types";
import type { Cents } from "@/lib/money";

/** Avança uma data (YYYY-MM-DD) conforme a frequência. */
export function nextOccurrence(
  date: string,
  frequency: RecurrenceFrequency,
): string {
  const d = parseISO(date);
  let next: Date;
  switch (frequency) {
    case "daily":
      next = addDays(d, 1);
      break;
    case "weekly":
      next = addWeeks(d, 1);
      break;
    case "biweekly":
      next = addWeeks(d, 2);
      break;
    case "monthly":
      next = addMonths(d, 1);
      break;
    case "yearly":
      next = addYears(d, 1);
      break;
    default:
      next = addMonths(d, 1);
  }
  return format(next, "yyyy-MM-dd");
}

/** Molde de lançamento gerado por uma recorrência (sem campos de sync). */
export type GeneratedTransaction = Omit<
  Transaction,
  "id" | "userId" | "createdAt" | "updatedAt" | "deleted" | "dirty"
>;

export interface RecurrenceUpdate {
  id: string;
  nextDate: string;
  active: 0 | 1;
}

export interface RecurrenceRun {
  /** lançamentos a criar (já com recurrenceId preenchido) */
  transactions: GeneratedTransaction[];
  /** atualizações a aplicar nas recorrências (nextDate avançado / desativação) */
  updates: RecurrenceUpdate[];
}

/**
 * Calcula tudo que está "vencido" até `today` para uma lista de recorrências.
 * Função pura — não toca no banco. Gera 1 lançamento por ocorrência vencida,
 * avançando nextDate; desativa a recorrência se passar de endDate.
 *
 * `maxPerRecurrence` evita loop infinito caso uma recorrência esteja muito
 * atrasada (gera no máximo N ocorrências por execução).
 */
export function generateDueTransactions(
  recurrences: Recurrence[],
  today: string,
  maxPerRecurrence = 60,
): RecurrenceRun {
  const transactions: GeneratedTransaction[] = [];
  const updates: RecurrenceUpdate[] = [];

  for (const rec of recurrences) {
    if (rec.active !== 1 || rec.deleted) continue;

    let next = rec.nextDate;
    let active: 0 | 1 = 1;
    let count = 0;

    while (next <= today && count < maxPerRecurrence) {
      // respeita data final
      if (rec.endDate && next > rec.endDate) {
        active = 0;
        break;
      }

      transactions.push({
        accountId: rec.accountId,
        toAccountId: rec.toAccountId ?? null,
        categoryId: rec.categoryId,
        kind: rec.kind,
        amountCents: rec.amountCents,
        currency: "BRL",
        date: next,
        description: rec.description,
        tags: [],
        status: "cleared",
        recurrenceId: rec.id,
      });

      next = nextOccurrence(next, rec.frequency);
      count++;

      if (rec.endDate && next > rec.endDate) {
        active = 0;
        break;
      }
    }

    if (next !== rec.nextDate || active !== rec.active) {
      updates.push({ id: rec.id, nextDate: next, active });
    }
  }

  return { transactions, updates };
}

/**
 * Efeito líquido (receitas − despesas) das recorrências que ainda vão acontecer
 * de hoje até `toDate` — base do "saldo previsto". Transferências não mexem no
 * patrimônio líquido. Função pura.
 */
export function projectedNet(
  recurrences: Recurrence[],
  toDate: string,
  today = new Date().toISOString().slice(0, 10),
): Cents {
  const future = recurrences
    .filter((r) => r.active === 1 && !r.deleted)
    .map((r) => ({ ...r, nextDate: r.nextDate > today ? r.nextDate : today }));
  const { transactions } = generateDueTransactions(future, toDate);
  let net = 0;
  for (const t of transactions) {
    if (t.kind === "income") net += t.amountCents;
    else if (t.kind === "expense") net -= t.amountCents;
  }
  return net;
}

/** Último dia do mês YYYY-MM como YYYY-MM-DD. */
export function lastDayOfMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m, 0);
  return `${y}-${String(m).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
