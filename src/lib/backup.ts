import { db } from "@/db/schema";
import i18n from "@/lib/i18n";
import { getSetting } from "@/lib/settings";
import { getActiveLocale } from "@/lib/i18n/config";

const EXPORT_TABLES = [
  "accounts",
  "categories",
  "transactions",
  "budgets",
  "goals",
  "recurrences",
  "exchangeRates",
  "settings",
] as const;

export interface BackupFile {
  app: "financeiro";
  version: 1;
  exportedAt: string;
  data: Record<string, unknown[]>;
}

/** Exporta todos os dados (exceto blobs de anexo) como JSON. */
export async function exportBackup(): Promise<BackupFile> {
  const data: Record<string, unknown[]> = {};
  for (const table of EXPORT_TABLES) {
    data[table] = await db.table(table).toArray();
  }
  return {
    app: "financeiro",
    version: 1,
    exportedAt: new Date().toISOString(),
    data,
  };
}

/** Dispara o download de um backup .json. */
export async function downloadBackup() {
  const backup = await exportBackup();
  const blob = new Blob([JSON.stringify(backup, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `financeiro-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

/* ------------------------------- CSV export ------------------------------- */
function csvEsc(v: string): string {
  return /[;"\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

/** Exporta os lançamentos como CSV (pt-BR, delimitador ;) para planilhas. */
export async function downloadCsv() {
  const [txs, cats, accts] = await Promise.all([
    db.transactions.toArray(),
    db.categories.toArray(),
    db.accounts.toArray(),
  ]);
  const catName = new Map(cats.map((c) => [c.id, c.name]));
  const acctName = new Map(accts.map((a) => [a.id, a.name]));
  const kindLabel: Record<string, string> = {
    income: "Receita",
    expense: "Despesa",
    transfer: "Transferência",
  };

  const header = ["Data", "Tipo", "Descrição", "Categoria", "Conta", "Valor"];
  const lines = txs
    .filter((t) => t.deleted === 0)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((t) => {
      const signed =
        t.kind === "income"
          ? t.amountCents
          : t.kind === "expense"
            ? -t.amountCents
            : 0;
      const cat = t.splits?.length
        ? "Dividido"
        : t.categoryId
          ? (catName.get(t.categoryId) ?? "")
          : "";
      return [
        t.date,
        kindLabel[t.kind] ?? t.kind,
        csvEsc(t.description),
        csvEsc(cat),
        csvEsc(acctName.get(t.accountId) ?? ""),
        (signed / 100).toFixed(2).replace(".", ","),
      ].join(";");
    });

  // BOM para o Excel reconhecer UTF-8
  const csv = "﻿" + [header.join(";"), ...lines].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `financeiro-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/* ------------------------------ Excel export ------------------------------ */

const CURRENCY_SYMBOL: Record<string, string> = {
  BRL: "R$",
  USD: "$",
  EUR: "€",
  GBP: "£",
  ARS: "$",
};

const INK = {
  brand: "FF534AB7", // índigo (header da tabela)
  brandDark: "FF26215C", // título
  zebra: "FFEEEDFE", // faixa clara
  income: "FF0F6E56",
  expense: "FFA32D2D",
  headerText: "FFFFFFFF",
  muted: "FF6B6B6B",
  border: "FFE2E2E8",
};

/**
 * Exporta os lançamentos como uma planilha Excel (.xlsx) estilizada — layout
 * "relatório": título + resumo do período + gasto por categoria e a tabela de
 * lançamentos com cabeçalho fixo, faixas zebra e cores de receita/despesa.
 * O `exceljs` é carregado sob demanda (dynamic import) pra não pesar o bundle.
 */
export async function downloadXlsx() {
  const ns = await import("exceljs");
  const ExcelJS = (ns as unknown as { default?: typeof ns }).default ?? ns;

  const [txsRaw, cats, accts, baseCurrency] = await Promise.all([
    db.transactions.toArray(),
    db.categories.toArray(),
    db.accounts.toArray(),
    getSetting("baseCurrency"),
  ]);

  const t = (k: string, o?: Record<string, unknown>) =>
    i18n.t(`xlsx.${k}`, o) as string;
  const locale = getActiveLocale();
  const symbol = CURRENCY_SYMBOL[baseCurrency] ?? "";
  const moneyFmt = `"${symbol}" #,##0.00;[Red]"${symbol}" -#,##0.00`;

  const catName = new Map(cats.map((c) => [c.id, c.name]));
  const acctName = new Map(accts.map((a) => [a.id, a.name]));
  const kindLabel: Record<string, string> = {
    income: t("kindIncome"),
    expense: t("kindExpense"),
    transfer: t("kindTransfer"),
  };

  const txs = txsRaw
    .filter((x) => x.deleted === 0)
    .sort((a, b) => a.date.localeCompare(b.date));

  const fmtDate = (iso: string) => {
    const [y, m, d] = iso.split("-");
    return new Intl.DateTimeFormat(locale).format(new Date(+y, +m - 1, +d));
  };

  // totais
  let incomeC = 0;
  let expenseC = 0;
  const byCat = new Map<string, number>();
  for (const x of txs) {
    if (x.kind === "income") incomeC += x.amountCents;
    else if (x.kind === "expense") {
      expenseC += x.amountCents;
      const name = x.splits?.length
        ? t("split")
        : x.categoryId
          ? (catName.get(x.categoryId) ?? t("noCategory"))
          : t("noCategory");
      byCat.set(name, (byCat.get(name) ?? 0) + x.amountCents);
    }
  }
  const catRows = [...byCat.entries()].sort((a, b) => b[1] - a[1]);
  const period =
    txs.length > 0 ? `${fmtDate(txs[0].date)} – ${fmtDate(txs[txs.length - 1].date)}` : "—";

  const wb = new ExcelJS.Workbook();
  wb.creator = "Financer";
  const ws = wb.addWorksheet("Financer");
  const widths = [14, 14, 40, 22, 20, 16];
  widths.forEach((w, i) => (ws.getColumn(i + 1).width = w));

  const money = (cents: number) => cents / 100;
  let r = 0;

  // título
  ws.mergeCells(1, 1, 1, 6);
  const title = ws.getCell("A1");
  title.value = "Financer";
  title.font = { name: "Calibri", size: 20, bold: true, color: { argb: INK.brandDark } };
  ws.getRow(1).height = 28;
  r = 1;

  ws.mergeCells(2, 1, 2, 6);
  const sub = ws.getCell("A2");
  sub.value = `${t("subtitle")}  ·  ${period}`;
  sub.font = { size: 11, color: { argb: INK.muted } };
  r = 3; // deixa a linha 3 em branco

  // resumo do período
  const summaryHeader = ws.getRow(++r); // r=4
  summaryHeader.getCell(1).value = t("summary");
  summaryHeader.getCell(1).font = { size: 13, bold: true };

  const addSummary = (label: string, cents: number, color?: string) => {
    const row = ws.getRow(++r);
    row.getCell(1).value = label;
    row.getCell(1).font = { color: { argb: INK.muted } };
    const cell = row.getCell(2);
    cell.value = money(cents);
    cell.numFmt = moneyFmt;
    cell.font = { bold: true, color: color ? { argb: color } : undefined };
    cell.alignment = { horizontal: "right" };
  };
  addSummary(t("incomeLabel"), incomeC, INK.income); // r=5
  addSummary(t("expenseLabel"), expenseC, INK.expense); // r=6
  addSummary(t("balanceLabel"), incomeC - expenseC); // r=7

  r++; // linha em branco (r=8)

  // gasto por categoria
  const byCatHeader = ws.getRow(++r); // r=9
  byCatHeader.getCell(1).value = t("byCategory");
  byCatHeader.getCell(1).font = { size: 13, bold: true };

  const catCols = ws.getRow(++r); // r=10
  [t("colCategory"), t("colSpent"), t("colPct")].forEach((label, i) => {
    const c = catCols.getCell(i + 1);
    c.value = label;
    c.font = { bold: true, color: { argb: INK.muted } };
    if (i > 0) c.alignment = { horizontal: "right" };
  });
  for (const [name, cents] of catRows) {
    const row = ws.getRow(++r);
    row.getCell(1).value = name;
    const val = row.getCell(2);
    val.value = money(cents);
    val.numFmt = moneyFmt;
    val.alignment = { horizontal: "right" };
    const pct = row.getCell(3);
    pct.value = expenseC > 0 ? cents / expenseC : 0;
    pct.numFmt = "0%";
    pct.alignment = { horizontal: "right" };
  }

  r++; // linha em branco

  // tabela de lançamentos
  const headerRowNum = ++r;
  const headerLabels = [
    t("colDate"),
    t("colType"),
    t("colDesc"),
    t("colCategory"),
    t("colAccount"),
    t("colAmount"),
  ];
  const headerRow = ws.getRow(headerRowNum);
  headerRow.height = 22;
  headerLabels.forEach((label, i) => {
    const c = headerRow.getCell(i + 1);
    c.value = label;
    c.font = { bold: true, color: { argb: INK.headerText } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: INK.brand } };
    c.alignment = { vertical: "middle", horizontal: i === 5 ? "right" : "left" };
  });

  for (const x of txs) {
    const row = ws.getRow(++r);
    const zebra = (r - headerRowNum) % 2 === 0;
    const signed =
      x.kind === "income"
        ? x.amountCents
        : x.kind === "expense"
          ? -x.amountCents
          : 0;
    const category = x.splits?.length
      ? t("split")
      : x.categoryId
        ? (catName.get(x.categoryId) ?? "")
        : "";
    const cells = [
      fmtDate(x.date),
      kindLabel[x.kind] ?? x.kind,
      x.description,
      category,
      acctName.get(x.accountId) ?? "",
      money(signed),
    ];
    cells.forEach((value, i) => {
      const c = row.getCell(i + 1);
      c.value = value;
      if (zebra)
        c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: INK.zebra } };
      c.border = { bottom: { style: "hair", color: { argb: INK.border } } };
      if (i === 5) {
        c.numFmt = moneyFmt;
        c.alignment = { horizontal: "right" };
        c.font = {
          color: { argb: signed < 0 ? INK.expense : signed > 0 ? INK.income : INK.muted },
        };
      }
    });
  }

  // cabeçalho fixo (mantém título + resumo + cabeçalho da tabela visíveis)
  ws.views = [{ state: "frozen", ySplit: headerRowNum }];
  // filtro na tabela
  if (txs.length > 0) {
    ws.autoFilter = {
      from: { row: headerRowNum, column: 1 },
      to: { row: r, column: 6 },
    };
  }

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `financer-${new Date().toISOString().slice(0, 10)}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}

/** Importa um backup, substituindo os dados atuais (merge por id via bulkPut). */
export async function importBackup(file: BackupFile): Promise<void> {
  if (file.app !== "financeiro") throw new Error("Arquivo inválido.");
  for (const table of EXPORT_TABLES) {
    const rows = file.data[table];
    if (Array.isArray(rows) && rows.length) {
      await db.table(table).bulkPut(rows);
    }
  }
}
