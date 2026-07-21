import type { Account, Transaction, Category, Goal, Budget } from "@/db/types";
import { balancesByAccount, currentInvoice } from "@/lib/calc";
import { goalSaved } from "@/lib/calc/goals";

/**
 * "Retrato financeiro" compacto (agregados, SEM lançamentos crus) que vai de
 * contexto pro assistente de IA. Valores em unidades da moeda (reais), não
 * centavos, pra ficar legível pro modelo e barato em tokens.
 */
export interface FinancialSnapshot {
  currency: string;
  today: string;
  saldoTotal: number;
  emContas: number;
  dividaCartao: number;
  contas: { nome: string; saldo: number }[];
  cartoes: { nome: string; faturaAberta: number; limite: number | null }[];
  ultimosMeses: { mes: string; entradas: number; saidas: number }[];
  gastoPorCategoriaAno: { categoria: string; total: number }[];
  gastoPorCategoriaMes: { categoria: string; total: number }[];
  metas: { nome: string; alvo: number; guardado: number; pct: number }[];
  orcamentosMes: { categoria: string; limite: number; gasto: number }[];
}

const r = (cents: number) => Math.round(cents) / 100;
const ym = (iso: string) => iso.slice(0, 7);

function lastMonths(today: string, n: number): string[] {
  const out: string[] = [];
  let [y, m] = today.slice(0, 7).split("-").map(Number);
  for (let i = 0; i < n; i++) {
    out.unshift(`${y}-${String(m).padStart(2, "0")}`);
    m--;
    if (m === 0) {
      m = 12;
      y--;
    }
  }
  return out;
}

export function buildSnapshot(
  accounts: Account[],
  transactions: Transaction[],
  categories: Category[],
  goals: Goal[],
  budgets: Budget[],
  currency: string,
  today = new Date().toISOString().slice(0, 10),
): FinancialSnapshot {
  const live = transactions.filter(
    (t) => t.deleted === 0 && t.status !== "pending",
  );
  const catName = new Map(categories.map((c) => [c.id, c.name]));
  const balances = balancesByAccount(accounts, transactions);

  const contas: FinancialSnapshot["contas"] = [];
  const cartoes: FinancialSnapshot["cartoes"] = [];
  let emContas = 0;
  let dividaCartao = 0;
  for (const a of accounts) {
    if (a.archived) continue;
    const bal = balances.get(a.id) ?? 0;
    if (a.type === "credit_card") {
      dividaCartao += bal;
      const inv = currentInvoice(a, transactions);
      cartoes.push({
        nome: a.name,
        faturaAberta: r(inv?.totalCents ?? 0),
        limite: a.creditLimitCents ? r(a.creditLimitCents) : null,
      });
    } else {
      emContas += bal;
      contas.push({ nome: a.name, saldo: r(bal) });
    }
  }

  const months = lastMonths(today, 6);
  const ultimosMeses = months.map((mm) => {
    let entradas = 0;
    let saidas = 0;
    for (const t of live) {
      if (ym(t.date) !== mm) continue;
      if (t.kind === "income") entradas += t.amountCents;
      else if (t.kind === "expense") saidas += t.amountCents;
    }
    return { mes: mm, entradas: r(entradas), saidas: r(saidas) };
  });

  const year = today.slice(0, 4);
  const month = today.slice(0, 7);
  const catAno = new Map<string, number>();
  const catMes = new Map<string, number>();
  for (const t of live) {
    if (t.kind !== "expense") continue;
    const name = t.categoryId
      ? (catName.get(t.categoryId) ?? "Sem categoria")
      : "Sem categoria";
    if (t.date.slice(0, 4) === year)
      catAno.set(name, (catAno.get(name) ?? 0) + t.amountCents);
    if (t.date.slice(0, 7) === month)
      catMes.set(name, (catMes.get(name) ?? 0) + t.amountCents);
  }
  const topCat = (m: Map<string, number>, n: number) =>
    [...m.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, n)
      .map(([categoria, cents]) => ({ categoria, total: r(cents) }));

  const metas = goals
    .filter((g) => g.deleted === 0)
    .map((g) => {
      const saved = goalSaved(g, balances);
      return {
        nome: g.name,
        alvo: r(g.targetCents),
        guardado: r(saved),
        pct: g.targetCents > 0 ? Math.round((saved / g.targetCents) * 100) : 0,
      };
    });

  // orçamentos do mês atual: gasto real por categoria no mês
  const spentByCat = new Map<string, number>();
  for (const t of live) {
    if (t.kind !== "expense" || t.date.slice(0, 7) !== month) continue;
    if (t.categoryId)
      spentByCat.set(
        t.categoryId,
        (spentByCat.get(t.categoryId) ?? 0) + t.amountCents,
      );
  }
  const orcamentosMes = budgets
    .filter((b) => b.deleted === 0)
    .map((b) => ({
      categoria: catName.get(b.categoryId) ?? "?",
      limite: r(b.limitCents),
      gasto: r(spentByCat.get(b.categoryId) ?? 0),
    }));

  return {
    currency,
    today,
    saldoTotal: r(emContas + dividaCartao),
    emContas: r(emContas),
    dividaCartao: r(dividaCartao),
    contas,
    cartoes,
    ultimosMeses,
    gastoPorCategoriaAno: topCat(catAno, 12),
    gastoPorCategoriaMes: topCat(catMes, 12),
    metas,
    orcamentosMes,
  };
}
