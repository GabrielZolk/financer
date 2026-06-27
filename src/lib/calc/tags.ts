/**
 * Agregação de tags (funções puras, testáveis). Tags são strings livres que
 * aparecem em `transaction.tags` e/ou em `split.tags`. Aqui calculamos, por
 * tag: nº de lançamentos, total gasto (despesa atribuída), série mensal dos
 * últimos 6 meses, primeiro uso e contas distintas.
 */
import type { Transaction } from "@/db/types";

export interface TagStat {
  tag: string;
  /** nº de lançamentos que usam a tag (base ou item de divisão) — conta cada lançamento uma vez */
  count: number;
  /** total de DESPESA atribuída à tag (centavos) */
  totalCents: number;
  /** despesa por mês, dos 6 meses até `refDate` (antigo → recente) */
  monthly: number[];
  /** primeira data em que a tag aparece (YYYY-MM-DD); "" se nenhuma */
  firstUse: string;
  /** ids de contas distintas onde a tag aparece */
  accountIds: string[];
}

/** Lista de chaves YYYY-MM dos últimos `n` meses até `ref` (antigo → recente). */
export function lastMonths(n: number, ref = new Date()): string[] {
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(ref.getFullYear(), ref.getMonth() - i, 1);
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}

/**
 * Atribuição de gasto:
 * - tag no nível base → o valor total do lançamento (despesa)
 * - senão, se aparece em itens da divisão → a soma desses itens
 * (evita contagem dupla preferindo o base). Receitas/transferências não
 * entram no "total gasto".
 */
export function computeTagStats(
  txs: Transaction[],
  refDate = new Date(),
): TagStat[] {
  const months = lastMonths(6, refDate);
  const monthIndex = new Map(months.map((m, i) => [m, i] as const));

  interface Acc {
    count: number;
    total: number;
    monthly: number[];
    first: string;
    accts: Set<string>;
  }
  const map = new Map<string, Acc>();
  const ensure = (tag: string): Acc => {
    let e = map.get(tag);
    if (!e) {
      e = { count: 0, total: 0, monthly: Array(6).fill(0), first: "", accts: new Set() };
      map.set(tag, e);
    }
    return e;
  };

  for (const t of txs) {
    if (t.deleted === 1) continue;
    const baseTags = t.tags ?? [];
    const present = new Set<string>(baseTags);
    t.splits?.forEach((s) => s.tags?.forEach((x) => present.add(x)));
    if (!present.size) continue;

    const mi = monthIndex.get(t.date.slice(0, 7));

    for (const tag of present) {
      const e = ensure(tag);
      e.count += 1;
      if (!e.first || t.date < e.first) e.first = t.date;
      if (t.accountId) e.accts.add(t.accountId);

      if (t.kind === "expense") {
        let amt = 0;
        if (baseTags.includes(tag)) {
          amt = t.amountCents;
        } else {
          t.splits?.forEach((s) => {
            if (s.tags?.includes(tag)) amt += s.amountCents;
          });
        }
        e.total += amt;
        if (mi !== undefined) e.monthly[mi] += amt;
      }
    }
  }

  return [...map.entries()].map(([tag, e]) => ({
    tag,
    count: e.count,
    totalCents: e.total,
    monthly: e.monthly,
    firstUse: e.first,
    accountIds: [...e.accts],
  }));
}

export type TagSort = "uses" | "total" | "alpha";

export function sortTagStats(stats: TagStat[], by: TagSort): TagStat[] {
  const arr = [...stats];
  if (by === "alpha") return arr.sort((a, b) => a.tag.localeCompare(b.tag, "pt-BR"));
  if (by === "total") return arr.sort((a, b) => b.totalCents - a.totalCents || b.count - a.count);
  return arr.sort((a, b) => b.count - a.count || b.totalCents - a.totalCents);
}

/* --------------------------- detector de duplicadas ------------------------ */
function norm(s: string): string {
  // remove acentos (faixa de marcas diacríticas combinantes U+0300–U+036F)
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (Math.abs(m - n) > 2) return 99;
  const dp = Array.from({ length: m + 1 }, (_, i) => i);
  for (let j = 1; j <= n; j++) {
    let prev = dp[0];
    dp[0] = j;
    for (let i = 1; i <= m; i++) {
      const tmp = dp[i];
      dp[i] = Math.min(
        dp[i] + 1,
        dp[i - 1] + 1,
        prev + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      prev = tmp;
    }
  }
  return dp[m];
}

/** Heurística de tags parecidas (caixa/acento, prefixo, 1 caractere de diff). */
export function looksDuplicate(a: string, b: string): boolean {
  const na = norm(a);
  const nb = norm(b);
  if (na === nb) return true;
  if (na.length < 3 || nb.length < 3) return false;
  if ((na.startsWith(nb) || nb.startsWith(na)) && Math.abs(na.length - nb.length) <= 3)
    return true;
  return levenshtein(na, nb) <= 1;
}

/**
 * Pares de tags possivelmente duplicadas. Em cada par, a mais usada vem 1º
 * (sugerida como destino da mesclagem).
 */
export function findDuplicatePairs(stats: TagStat[]): [string, string][] {
  const pairs: [string, string][] = [];
  for (let i = 0; i < stats.length; i++) {
    for (let j = i + 1; j < stats.length; j++) {
      if (looksDuplicate(stats[i].tag, stats[j].tag)) {
        const [a, b] =
          stats[i].count >= stats[j].count
            ? [stats[i].tag, stats[j].tag]
            : [stats[j].tag, stats[i].tag];
        pairs.push([a, b]);
      }
    }
  }
  return pairs;
}
