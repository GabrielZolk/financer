import type { Category, Transaction } from "@/db/types";

/**
 * Categorização automática que aprende do PRÓPRIO histórico — sem IA, sem
 * custo e sem depender de rede. A ideia: você já categorizou "PG *IFD BR"
 * uma vez; da próxima o app não deveria perguntar de novo.
 *
 * Casa por "assinatura" da descrição: as palavras que identificam o
 * estabelecimento, ignorando lixo do extrato (datas, nº de parcela, ids,
 * prefixos de operadora). Se a mesma assinatura tem categorias diferentes no
 * histórico, vence a mais frequente; empate técnico (nenhuma com folga) fica
 * sem palpite — melhor não chutar.
 */

const NOISE = new Set([
  "pg",
  "pgto",
  "pagto",
  "pagamento",
  "compra",
  "cartao",
  "debito",
  "credito",
  "deb",
  "cred",
  "br",
  "bra",
  "brasil",
  "ltda",
  "me",
  "sa",
  "eireli",
  "parc",
  "parcela",
  "tef",
  "pix",
  "ted",
  "doc",
  "rec",
  "env",
  "des",
  "de",
  "da",
  "do",
  "para",
  "com",
]);

/** Normaliza: sem acento, minúsculo, só letras/números. */
export function normalizeDesc(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Assinatura da descrição: os 2 primeiros tokens úteis (≥3 letras, não-ruído,
 * não puro número). "PG *IFD BR 08/26" -> "ifd"; "UBER* TRIP SP" -> "uber trip".
 * Dois tokens é o ponto de equilíbrio: "UBER TRIP HELP" e "UBER TRIP SP" caem
 * na mesma assinatura, mas "MERCADO EXTRA" e "MERCADO DIA" continuam separados.
 */
export function descSignature(description: string): string {
  const tokens = normalizeDesc(description)
    .split(" ")
    .filter((w) => w.length >= 3 && !NOISE.has(w) && !/^\d+$/.test(w))
    .slice(0, 2);
  return tokens.join(" ");
}

export interface LearnedRules {
  /** assinatura -> categoryId */
  bySignature: Map<string, string>;
}

/**
 * Monta as regras a partir do histórico já categorizado.
 * `minConfidence`: a categoria vencedora precisa ter essa fatia dos casos
 * daquela assinatura (0.6 = 60%) pra virar palpite.
 */
export function learnRules(
  transactions: Transaction[],
  minConfidence = 0.6,
): LearnedRules {
  const counts = new Map<string, Map<string, number>>();
  for (const tx of transactions) {
    if (tx.deleted === 1 || !tx.categoryId || !tx.description) continue;
    if (tx.kind === "transfer") continue;
    const sig = descSignature(tx.description);
    if (!sig) continue;
    let inner = counts.get(sig);
    if (!inner) counts.set(sig, (inner = new Map()));
    inner.set(tx.categoryId, (inner.get(tx.categoryId) ?? 0) + 1);
  }

  const bySignature = new Map<string, string>();
  for (const [sig, inner] of counts) {
    let total = 0;
    let bestId = "";
    let best = 0;
    for (const [catId, n] of inner) {
      total += n;
      if (n > best) {
        best = n;
        bestId = catId;
      }
    }
    if (bestId && best / total >= minConfidence) bySignature.set(sig, bestId);
  }
  return { bySignature };
}

/**
 * Aplica as regras aprendidas nas descrições a importar.
 * Devolve um array alinhado por índice (null = sem palpite).
 * Só devolve categorias que ainda existem.
 */
export function applyLearnedRules(
  descriptions: string[],
  rules: LearnedRules,
  categories: Pick<Category, "id">[],
): (string | null)[] {
  const alive = new Set(categories.map((c) => c.id));
  return descriptions.map((d) => {
    const id = rules.bySignature.get(descSignature(d));
    return id && alive.has(id) ? id : null;
  });
}
