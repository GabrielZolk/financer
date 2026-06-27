/**
 * Money handling — valores SEMPRE em centavos inteiros (BigInt-safe range).
 * Nunca usar float para dinheiro. Todas as operações aqui são exatas.
 */

export type Cents = number;

/** Soma uma lista de valores em centavos. */
export function sumCents(values: Cents[]): Cents {
  return values.reduce((acc, v) => acc + Math.round(v), 0);
}

/** Converte um valor decimal (ex.: 12.34) para centavos inteiros (1234). */
export function toCents(value: number): Cents {
  return Math.round(value * 100);
}

/** Converte centavos para número decimal (1234 -> 12.34). Use só para exibição/gráficos. */
export function fromCents(cents: Cents): number {
  return cents / 100;
}

/**
 * Faz o parse de uma string digitada pelo usuário em centavos.
 * Aceita formatos pt-BR e en-US: "1.234,56", "1234.56", "1234,56", "R$ 10".
 * Retorna null se não for um número válido.
 */
export function parseMoney(input: string): Cents | null {
  if (input == null) return null;
  let s = String(input).trim();
  if (!s) return null;

  // Remove símbolos de moeda e espaços
  s = s.replace(/[^\d.,-]/g, "");
  if (!s || s === "-" || s === "." || s === ",") return null;

  const hasComma = s.includes(",");
  const hasDot = s.includes(".");

  if (hasComma && hasDot) {
    // O último separador é o decimal; o outro é de milhar.
    if (s.lastIndexOf(",") > s.lastIndexOf(".")) {
      // pt-BR: "1.234,56"
      s = s.replace(/\./g, "").replace(",", ".");
    } else {
      // en-US: "1,234.56"
      s = s.replace(/,/g, "");
    }
  } else if (hasComma) {
    // Apenas vírgula -> decimal
    s = s.replace(",", ".");
  }
  // Apenas ponto (ou nenhum) já está em formato JS

  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
}

const formatterCache = new Map<string, Intl.NumberFormat>();

function getFormatter(currency: string, locale = "pt-BR"): Intl.NumberFormat {
  const key = `${locale}:${currency}`;
  let fmt = formatterCache.get(key);
  if (!fmt) {
    fmt = new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
    });
    formatterCache.set(key, fmt);
  }
  return fmt;
}

/** Formata centavos como moeda (ex.: 123456 -> "R$ 1.234,56"). */
export function formatMoney(
  cents: Cents,
  currency = "BRL",
  locale = "pt-BR",
): string {
  return getFormatter(currency, locale).format(cents / 100);
}

/** Formata com sinal explícito (+/-) para fluxo de caixa. */
export function formatSigned(
  cents: Cents,
  currency = "BRL",
  locale = "pt-BR",
): string {
  const sign = cents > 0 ? "+" : cents < 0 ? "-" : "";
  return sign + formatMoney(Math.abs(cents), currency, locale);
}
