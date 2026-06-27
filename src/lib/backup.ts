import { db } from "@/db/schema";

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
