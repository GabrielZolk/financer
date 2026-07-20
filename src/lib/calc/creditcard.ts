import {
  parseISO,
  format,
  addMonths,
  subMonths,
  addDays,
  endOfMonth,
  setDate,
  min,
} from "date-fns";
import type { Account, Transaction } from "@/db/types";
import type { Cents } from "@/lib/money";
import { getActiveLocale } from "@/lib/i18n/config";

/**
 * Limite efetivo do cartão = limite base + saldo da garantia (limite garantido).
 * `securedBalanceCents` é o saldo atual da conta-garantia (0 se não houver).
 * Nunca subtrai (garantia negativa não reduz o limite).
 */
export function effectiveLimit(
  account: Account,
  securedBalanceCents = 0,
): Cents {
  return (account.creditLimitCents ?? 0) + Math.max(securedBalanceCents, 0);
}

/** Retorna uma data no mês de `base` com o dia pedido, limitado ao fim do mês. */
function dateWithDay(base: Date, day: number): Date {
  const last = endOfMonth(base);
  return min([setDate(base, day), last]);
}

export interface InvoiceInfo {
  cycleStart: string; // YYYY-MM-DD (inclusive)
  closeDate: string; // YYYY-MM-DD (dia de fechamento)
  dueDate: string; // YYYY-MM-DD (vencimento)
  totalCents: Cents;
}

/**
 * Calcula a fatura ABERTA de um cartão de crédito na data `today`.
 * - Fecha no dia `statementDay`; vence no dia `dueDay`.
 * - A fatura aberta acumula despesas desde o dia seguinte ao último
 *   fechamento até o próximo fechamento.
 */
export function currentInvoice(
  account: Account,
  transactions: Transaction[],
  today = new Date().toISOString().slice(0, 10),
): InvoiceInfo | null {
  if (account.type !== "credit_card" || !account.statementDay) return null;

  const t = parseISO(today);
  const statementDay = account.statementDay;
  const dueDay = account.dueDay ?? statementDay;

  const closeThisMonth = dateWithDay(t, statementDay);
  const nextClose =
    t <= closeThisMonth
      ? closeThisMonth
      : dateWithDay(addMonths(t, 1), statementDay);
  const prevClose = dateWithDay(subMonths(nextClose, 1), statementDay);
  const cycleStart = addDays(prevClose, 1);

  // vencimento: se o dia de vencimento é depois do fechamento, é no mesmo mês;
  // senão, vence no mês seguinte.
  const dueBase = dueDay > statementDay ? nextClose : addMonths(nextClose, 1);
  const dueDate = dateWithDay(dueBase, dueDay);

  const startStr = format(cycleStart, "yyyy-MM-dd");
  const closeStr = format(nextClose, "yyyy-MM-dd");

  let total = 0;
  for (const tx of transactions) {
    if (tx.deleted || tx.status === "pending") continue;
    if (tx.accountId !== account.id) continue;
    if (tx.date < startStr || tx.date > closeStr) continue;
    // compras somam; estornos/créditos (receita no cartão) abatem
    if (tx.kind === "expense") total += tx.amountCents;
    else if (tx.kind === "income") total -= tx.amountCents;
  }

  return {
    cycleStart: startStr,
    closeDate: closeStr,
    dueDate: format(dueDate, "yyyy-MM-dd"),
    totalCents: Math.max(total, 0),
  };
}

export interface InvoiceMonth {
  ym: string; // YYYY-MM do fechamento
  monthLabel: string; // "jul"
  totalCents: Cents;
  cycleStart: string;
  closeDate: string;
  dueDate: string;
  /** melhor dia de compra (dia seguinte ao fechamento → maior prazo) */
  bestBuyDate: string;
}

/**
 * Quanto já foi pago de uma fatura específica. Um pagamento é uma transferência
 * PARA o cartão; pode estar marcado com `paysInvoiceMonth` (novo, explícito) ou,
 * pra dados antigos, é atribuído pela data cair dentro do ciclo da fatura.
 */
export function invoicePaid(
  account: Account,
  transactions: Transaction[],
  month: Pick<InvoiceMonth, "ym" | "cycleStart" | "closeDate">,
): Cents {
  let paid = 0;
  for (const tx of transactions) {
    if (tx.deleted || tx.status === "pending") continue;
    if (tx.kind !== "transfer" || tx.toAccountId !== account.id) continue;
    if (tx.paysInvoiceMonth) {
      if (tx.paysInvoiceMonth === month.ym) paid += tx.amountCents;
    } else if (tx.date >= month.cycleStart && tx.date <= month.closeDate) {
      // legado: pagamento sem marca, atribuído pelo ciclo em que caiu
      paid += tx.amountCents;
    }
  }
  return paid;
}

function buildInvoice(
  account: Account,
  transactions: Transaction[],
  closeDate: Date,
): InvoiceMonth {
  const statementDay = account.statementDay!;
  const dueDay = account.dueDay ?? statementDay;
  const prevClose = dateWithDay(subMonths(closeDate, 1), statementDay);
  const cycleStart = addDays(prevClose, 1);
  const dueBase = dueDay > statementDay ? closeDate : addMonths(closeDate, 1);
  const dueDate = dateWithDay(dueBase, dueDay);
  const startStr = format(cycleStart, "yyyy-MM-dd");
  const closeStr = format(closeDate, "yyyy-MM-dd");

  let total = 0;
  for (const tx of transactions) {
    if (tx.deleted || tx.status === "pending") continue;
    if (tx.accountId !== account.id) continue;
    if (tx.date < startStr || tx.date > closeStr) continue;
    if (tx.kind === "expense") total += tx.amountCents;
    else if (tx.kind === "income") total -= tx.amountCents;
  }
  total = Math.max(total, 0);

  return {
    ym: format(closeDate, "yyyy-MM"),
    monthLabel: closeDate
      .toLocaleDateString(getActiveLocale(), { month: "short" })
      .replace(".", ""),
    totalCents: total,
    cycleStart: startStr,
    closeDate: closeStr,
    dueDate: format(dueDate, "yyyy-MM-dd"),
    bestBuyDate: format(addDays(closeDate, 1), "yyyy-MM-dd"),
  };
}

/**
 * Série de faturas para o carrossel: 1 fechada + a aberta + 2 futuras
 * (as futuras já mostram parcelas comprometidas). `openIndex` = a fatura aberta.
 */
export function invoiceSeries(
  account: Account,
  transactions: Transaction[],
  today = new Date().toISOString().slice(0, 10),
): { months: InvoiceMonth[]; openIndex: number } {
  if (account.type !== "credit_card" || !account.statementDay)
    return { months: [], openIndex: -1 };

  const statementDay = account.statementDay;
  const t = parseISO(today);
  const closeThis = dateWithDay(t, statementDay);
  const openClose =
    t <= closeThis ? closeThis : dateWithDay(addMonths(t, 1), statementDay);

  const offsets = [-3, -2, -1, 0, 1, 2];
  const months = offsets.map((o) =>
    buildInvoice(
      account,
      transactions,
      dateWithDay(addMonths(openClose, o), statementDay),
    ),
  );
  return { months, openIndex: offsets.indexOf(0) };
}
