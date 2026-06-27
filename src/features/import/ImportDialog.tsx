import { useMemo, useRef, useState } from "react";
import { Upload, FileText } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button, Label, Select } from "@/components/ui/primitives";
import { bulkCreate } from "@/db/repo";
import { useAccounts } from "@/db/hooks";
import { formatMoney } from "@/lib/money";
import {
  parseOfx,
  parseCsvRows,
  guessCsvColumns,
  csvToTransactions,
  type ParsedTx,
  type CsvColumnGuess,
} from "@/lib/import";
import type { Transaction } from "@/db/types";

type Mode = "idle" | "csv" | "ready" | "done";

export function ImportDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const accounts = useAccounts(true);
  const fileRef = useRef<HTMLInputElement>(null);

  const [mode, setMode] = useState<Mode>("idle");
  const [fileName, setFileName] = useState("");
  const [accountId, setAccountId] = useState("");
  const [csvRows, setCsvRows] = useState<string[][]>([]);
  const [cols, setCols] = useState<CsvColumnGuess>({
    date: 0,
    description: 1,
    amount: 2,
    headerRow: 0,
  });
  const [ofxTxs, setOfxTxs] = useState<ParsedTx[]>([]);
  const [importedCount, setImportedCount] = useState(0);
  const [error, setError] = useState("");

  function reset() {
    setMode("idle");
    setFileName("");
    setCsvRows([]);
    setOfxTxs([]);
    setError("");
    setImportedCount(0);
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError("");
    setFileName(file.name);
    if (!accountId && accounts[0]) setAccountId(accounts[0].id);
    const text = await file.text();
    const isOfx = /\.ofx$/i.test(file.name) || /<STMTTRN>/i.test(text);
    if (isOfx) {
      const txs = parseOfx(text);
      setOfxTxs(txs);
      setMode("ready");
    } else {
      const rows = parseCsvRows(text);
      setCsvRows(rows);
      setCols(guessCsvColumns(rows));
      setMode("csv");
    }
    e.target.value = "";
  }

  // lançamentos derivados (preview)
  const parsed: ParsedTx[] = useMemo(() => {
    if (mode === "csv") return csvToTransactions(csvRows, cols);
    if (mode === "ready") return ofxTxs;
    return [];
  }, [mode, csvRows, cols, ofxTxs]);

  const colOptions = csvRows[0]?.map((_, i) => i) ?? [];

  async function confirmImport() {
    if (!accountId) {
      setError("Selecione a conta de destino.");
      return;
    }
    if (!parsed.length) {
      setError("Nenhum lançamento reconhecido.");
      return;
    }
    const account = accounts.find((a) => a.id === accountId);
    await bulkCreate<Transaction>(
      "transactions",
      parsed.map((t) => ({
        accountId,
        toAccountId: null,
        categoryId: null,
        kind: t.amountCents < 0 ? ("expense" as const) : ("income" as const),
        amountCents: Math.abs(t.amountCents),
        currency: account?.currency ?? "BRL",
        date: t.date,
        description: t.description,
        tags: ["importado"],
        status: "cleared" as const,
      })),
    );
    setImportedCount(parsed.length);
    setMode("done");
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent title="Importar extrato">
        {mode === "idle" && (
          <div className="space-y-4">
            <p className="text-sm text-muted">
              Importe um extrato em <strong>CSV</strong> ou <strong>OFX</strong>{" "}
              do seu banco. Valores negativos viram despesas; positivos, receitas.
            </p>
            <Button className="w-full" onClick={() => fileRef.current?.click()}>
              <Upload size={16} /> Escolher arquivo
            </Button>
          </div>
        )}

        {(mode === "csv" || mode === "ready") && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm text-muted">
              <FileText size={16} /> {fileName}
            </div>

            <div>
              <Label>Conta de destino</Label>
              <Select
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
              >
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </Select>
            </div>

            {mode === "csv" && (
              <div className="grid grid-cols-3 gap-2">
                {(["date", "description", "amount"] as const).map((key) => (
                  <div key={key}>
                    <Label>
                      {key === "date"
                        ? "Data"
                        : key === "description"
                          ? "Descrição"
                          : "Valor"}
                    </Label>
                    <Select
                      value={String(cols[key])}
                      onChange={(e) =>
                        setCols({ ...cols, [key]: Number(e.target.value) })
                      }
                    >
                      {colOptions.map((i) => (
                        <option key={i} value={i}>
                          Coluna {i + 1}
                        </option>
                      ))}
                    </Select>
                  </div>
                ))}
              </div>
            )}

            <div>
              <p className="mb-1 text-sm font-medium">
                {parsed.length} lançamento(s) reconhecido(s)
              </p>
              <div className="max-h-48 space-y-1 overflow-y-auto rounded-xl border border-border p-2">
                {parsed.slice(0, 30).map((t, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between text-xs"
                  >
                    <span className="truncate text-muted">
                      {t.date} · {t.description}
                    </span>
                    <span
                      className="tabular"
                      style={{
                        color:
                          t.amountCents < 0 ? "var(--expense)" : "var(--income)",
                      }}
                    >
                      {formatMoney(t.amountCents)}
                    </span>
                  </div>
                ))}
                {parsed.length === 0 && (
                  <p className="text-xs text-muted">
                    Nada reconhecido — ajuste as colunas acima.
                  </p>
                )}
              </div>
            </div>

            {error && <p className="text-sm text-expense">{error}</p>}

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={reset}>
                Trocar arquivo
              </Button>
              <Button onClick={confirmImport} disabled={!parsed.length}>
                Importar {parsed.length}
              </Button>
            </div>
          </div>
        )}

        {mode === "done" && (
          <div className="space-y-4 text-center">
            <p className="text-lg font-semibold text-income">
              {importedCount} lançamentos importados! ✅
            </p>
            <Button
              className="w-full"
              onClick={() => {
                reset();
                onOpenChange(false);
              }}
            >
              Concluir
            </Button>
          </div>
        )}

        <input
          ref={fileRef}
          type="file"
          accept=".csv,.ofx,.txt"
          className="hidden"
          onChange={handleFile}
        />
      </DialogContent>
    </Dialog>
  );
}
