/**
 * Importação de extratos bancários (CSV e OFX).
 * Tudo aqui é puro/testável; a UI (features/import) faz o mapeamento e a criação.
 */

export interface ParsedTx {
  date: string; // YYYY-MM-DD
  description: string;
  /** valor em centavos, COM sinal: negativo = saída, positivo = entrada */
  amountCents: number;
}

/* --------------------------------- Datas ---------------------------------- */

/** Faz o parse de datas comuns: dd/mm/aaaa, aaaa-mm-dd, dd-mm-aaaa, aaaammdd. */
export function parseDateFlexible(input: string): string | null {
  const s = input.trim();
  if (!s) return null;

  // aaaa-mm-dd
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;

  // dd/mm/aaaa ou dd-mm-aaaa (aceita aa de 2 dígitos)
  m = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})/);
  if (m) {
    const d = m[1].padStart(2, "0");
    const mo = m[2].padStart(2, "0");
    let y = m[3];
    if (y.length === 2) y = "20" + y;
    return `${y}-${mo}-${d}`;
  }

  // aaaammdd (OFX)
  m = s.match(/^(\d{4})(\d{2})(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;

  return null;
}

/* -------------------------------- Valores --------------------------------- */

/** Faz o parse de um valor monetário (BR ou US) em centavos COM sinal. */
export function parseAmountSigned(input: string): number | null {
  if (input == null) return null;
  let s = String(input).trim();
  if (!s) return null;

  const negative = /^-/.test(s) || /\(.*\)/.test(s) || /\bD\b/i.test(s);
  s = s.replace(/[()]/g, "").replace(/[^\d.,-]/g, "");
  if (!s || s === "-") return null;

  const hasComma = s.includes(",");
  const hasDot = s.includes(".");
  if (hasComma && hasDot) {
    if (s.lastIndexOf(",") > s.lastIndexOf(".")) {
      s = s.replace(/\./g, "").replace(",", ".");
    } else {
      s = s.replace(/,/g, "");
    }
  } else if (hasComma) {
    s = s.replace(",", ".");
  }

  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  const cents = Math.round(Math.abs(n) * 100);
  return negative ? -cents : cents;
}

/* ---------------------------------- CSV ----------------------------------- */

/** Detecta o delimitador (',' ou ';' ou tab) pela primeira linha. */
function detectDelimiter(line: string): string {
  const counts = { ",": 0, ";": 0, "\t": 0 };
  for (const ch of line) if (ch in counts) counts[ch as keyof typeof counts]++;
  return (Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? ",") as string;
}

/** Parser de CSV com suporte a campos entre aspas. Retorna matriz de células. */
export function parseCsvRows(text: string): string[][] {
  const clean = text.replace(/^﻿/, "").replace(/\r\n/g, "\n");
  const firstLine = clean.split("\n")[0] ?? "";
  const delim = detectDelimiter(firstLine);

  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < clean.length; i++) {
    const c = clean[i];
    if (inQuotes) {
      if (c === '"') {
        if (clean[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === delim) {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += c;
    }
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

export interface CsvColumnGuess {
  date: number;
  description: number;
  amount: number;
  /** índice de uma linha de cabeçalho detectada, ou -1 */
  headerRow: number;
}

const DATE_HEADERS = ["data", "date", "dt"];
const DESC_HEADERS = ["desc", "histó", "histo", "memo", "lançamento", "lancamento", "detalhe", "title"];
const AMOUNT_HEADERS = ["valor", "amount", "value", "montante", "vlr"];

/** Tenta adivinhar quais colunas são data/descrição/valor. */
export function guessCsvColumns(rows: string[][]): CsvColumnGuess {
  const guess: CsvColumnGuess = { date: 0, description: 1, amount: 2, headerRow: -1 };
  if (!rows.length) return guess;

  // procura cabeçalho nas 3 primeiras linhas
  for (let r = 0; r < Math.min(3, rows.length); r++) {
    const cells = rows[r].map((c) => c.toLowerCase().trim());
    const di = cells.findIndex((c) => DATE_HEADERS.some((h) => c.includes(h)));
    const ai = cells.findIndex((c) => AMOUNT_HEADERS.some((h) => c.includes(h)));
    if (di >= 0 && ai >= 0) {
      guess.headerRow = r;
      guess.date = di;
      guess.amount = ai;
      const ei = cells.findIndex((c) => DESC_HEADERS.some((h) => c.includes(h)));
      guess.description = ei >= 0 ? ei : di === 0 && ai === 2 ? 1 : 0;
      return guess;
    }
  }

  // sem cabeçalho: detecta pela primeira linha de dados
  const sample = rows[0];
  for (let i = 0; i < sample.length; i++) {
    if (parseDateFlexible(sample[i])) {
      guess.date = i;
      break;
    }
  }
  for (let i = sample.length - 1; i >= 0; i--) {
    if (i !== guess.date && parseAmountSigned(sample[i]) !== null) {
      guess.amount = i;
      break;
    }
  }
  guess.description = sample.findIndex(
    (_, i) => i !== guess.date && i !== guess.amount,
  );
  if (guess.description < 0) guess.description = guess.date;
  return guess;
}

/** Converte linhas + mapeamento de colunas em lançamentos. */
export function csvToTransactions(
  rows: string[][],
  cols: CsvColumnGuess,
): ParsedTx[] {
  const out: ParsedTx[] = [];
  const start = cols.headerRow + 1;
  for (let r = start; r < rows.length; r++) {
    const cells = rows[r];
    const date = parseDateFlexible(cells[cols.date] ?? "");
    const amount = parseAmountSigned(cells[cols.amount] ?? "");
    if (!date || amount === null || amount === 0) continue;
    out.push({
      date,
      description: (cells[cols.description] ?? "").trim() || "Importado",
      amountCents: amount,
    });
  }
  return out;
}

/* ---------------------------------- OFX ----------------------------------- */

function ofxTag(block: string, tag: string): string | null {
  const m = block.match(new RegExp(`<${tag}>([^<\\r\\n]+)`, "i"));
  return m ? m[1].trim() : null;
}

/** Faz o parse de um arquivo OFX (extrai os <STMTTRN>). */
export function parseOfx(text: string): ParsedTx[] {
  const out: ParsedTx[] = [];
  const blocks = text.split(/<STMTTRN>/i).slice(1);
  for (const block of blocks) {
    const dt = ofxTag(block, "DTPOSTED");
    const amt = ofxTag(block, "TRNAMT");
    const memo = ofxTag(block, "MEMO") ?? ofxTag(block, "NAME");
    const date = dt ? parseDateFlexible(dt) : null;
    const amount = amt ? parseAmountSigned(amt) : null;
    if (!date || amount === null || amount === 0) continue;
    out.push({ date, description: memo ?? "Importado", amountCents: amount });
  }
  return out;
}
