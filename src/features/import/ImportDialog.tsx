import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Upload, FileText, Sparkles, Wand2, ShieldCheck } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button, Input, Label, Select } from "@/components/ui/primitives";
import { bulkCreate } from "@/db/repo";
import { useAccounts, useAllTransactions, useCategories } from "@/db/hooks";
import { useSettings } from "@/lib/settings";
import { useSyncState } from "@/lib/sync";
import { categorizeImport } from "@/lib/aiCategorize";
import { learnRules, applyLearnedRules } from "@/lib/autoCategory";
import { AiError } from "@/lib/ai";
import { formatMoney } from "@/lib/money";
import {
  parseOfx,
  parseCsvRows,
  guessCsvColumns,
  csvToTransactions,
  parseStatementText,
  type ParsedTx,
  type CsvColumnGuess,
} from "@/lib/import";
import { pdfToText, PdfPasswordRequired } from "@/lib/pdfText";
import { redactAll } from "@/lib/redact";
import type { Transaction } from "@/db/types";

type Mode = "idle" | "csv" | "ready" | "done" | "password";

export function ImportDialog({
  open,
  onOpenChange,
  initialFile,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /** arquivo já escolhido fora do diálogo (ex.: arrastado pra tela) */
  initialFile?: File | null;
}) {
  const { t } = useTranslation();
  const accounts = useAccounts(true);
  const allTx = useAllTransactions();
  const categories = useCategories();
  const settings = useSettings();
  const sync = useSyncState();
  const fileRef = useRef<HTMLInputElement>(null);
  const aiAvailable =
    settings.aiEnabled && (sync.status === "idle" || sync.status === "syncing");

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
  const [skippedCount, setSkippedCount] = useState(0);
  const [error, setError] = useState("");
  const [cats, setCats] = useState<(string | null)[]>([]);
  // PDF protegido: guardamos o arquivo pra tentar de novo com a senha
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pdfPassword, setPdfPassword] = useState("");
  const [pdfWrongPassword, setPdfWrongPassword] = useState(false);
  const [reading, setReading] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState("");

  function reset() {
    setMode("idle");
    setFileName("");
    setCsvRows([]);
    setOfxTxs([]);
    setError("");
    setImportedCount(0);
    setSkippedCount(0);
    setCats([]);
    setAiError("");
    setPdfFile(null);
    setPdfPassword("");
    setPdfWrongPassword(false);
  }

  async function loadFile(file: File, password?: string) {
    setError("");
    setFileName(file.name);
    if (!accountId && accounts[0]) setAccountId(accounts[0].id);

    // PDF: o texto é extraído aqui no aparelho; o arquivo não sai daqui
    if (/\.pdf$/i.test(file.name) || file.type === "application/pdf") {
      setPdfFile(file);
      setReading(true);
      try {
        const text = await pdfToText(file, password);
        const txs = parseStatementText(text);
        setPdfPassword("");
        setPdfWrongPassword(false);
        if (!txs.length) {
          setError(t("imp.pdfNoRows"));
          setMode("idle");
          return;
        }
        setOfxTxs(txs);
        setMode("ready");
      } catch (e) {
        if (e instanceof PdfPasswordRequired) {
          setPdfWrongPassword(e.wrong);
          setMode("password");
        } else {
          setError(t("imp.pdfFailed"));
          setMode("idle");
        }
      } finally {
        setReading(false);
      }
      return;
    }

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
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    await loadFile(file);
    e.target.value = "";
  }

  // arquivo arrastado pra tela: já entra direto na revisão
  useEffect(() => {
    if (open && initialFile) void loadFile(initialFile);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialFile]);

  // lançamentos derivados (preview)
  const parsed: ParsedTx[] = useMemo(() => {
    if (mode === "csv") return csvToTransactions(csvRows, cols);
    if (mode === "ready") return ofxTxs;
    return [];
  }, [mode, csvRows, cols, ofxTxs]);

  const colOptions = csvRows[0]?.map((_, i) => i) ?? [];
  // 1ª linha de dados, pra mostrar um exemplo do conteúdo de cada coluna
  const sampleRow = csvRows[cols.headerRow >= 0 ? cols.headerRow + 1 : 0] ?? [];

  const categoryMap = useMemo(
    () => new Map(categories.map((c) => [c.id, c.name])),
    [categories],
  );
  // regras aprendidas do próprio histórico (grátis, sem IA)
  const learned = useMemo(() => learnRules(allTx), [allTx]);

  /**
   * Ao trocar de arquivo/mapeamento, já preenche o que o histórico souber
   * responder. O que sobrar em branco é o que vale mandar pra IA.
   */
  useEffect(() => {
    setCats(
      parsed.length
        ? applyLearnedRules(
            parsed.map((p) => p.description),
            learned,
            categories,
          )
        : [],
    );
    setAiError("");
  }, [parsed, learned, categories]);

  const autoFilled = cats.filter(Boolean).length;

  /** exatamente o texto que iria pra IA — já mascarado — pra você conferir antes */
  const pendingForAi = useMemo(
    () =>
      redactAll(parsed.filter((_, i) => !cats[i]).map((p) => p.description))
        .redacted,
    [parsed, cats],
  );

  async function runAiCategorize() {
    if (aiBusy || !parsed.length) return;
    // manda pra IA só o que o histórico não resolveu (mais barato e mais rápido)
    const todo = parsed
      .map((p, i) => ({ i, description: p.description }))
      .filter(({ i }) => !cats[i]);
    if (!todo.length) return;
    setAiBusy(true);
    setAiError("");
    try {
      // CPF, conta, cartão e e-mail saem antes de a descrição deixar o aparelho
      const { redacted } = redactAll(todo.map((x) => x.description));
      const result = await categorizeImport(
        redacted,
        categories.map((c) => ({ id: c.id, name: c.name, kind: c.kind })),
      );
      setCats((prev) => {
        const next = parsed.map((_, i) => prev[i] ?? null);
        todo.forEach((x, k) => {
          if (result[k]) next[x.i] = result[k];
        });
        return next;
      });
    } catch (e) {
      const code = e instanceof AiError ? e.code : "ai_error";
      setAiError(t(`ai.err.${code}`, { defaultValue: t("ai.err.ai_error") }));
    } finally {
      setAiBusy(false);
    }
  }

  async function confirmImport() {
    if (!accountId) {
      setError(t("imp.errDest"));
      return;
    }
    if (!parsed.length) {
      setError(t("imp.errNone"));
      return;
    }
    const account = accounts.find((a) => a.id === accountId);
    // dedup: não recria lançamentos que já existem nessa conta (mesma data,
    // valor e tipo) — evita duplicar ao reimportar o mesmo extrato
    const key = (date: string, cents: number, kind: string) =>
      `${date}|${cents}|${kind}`;
    const seen = new Set(
      allTx
        .filter((x) => x.accountId === accountId && x.deleted === 0)
        .map((x) => key(x.date, x.amountCents, x.kind)),
    );
    const fresh = parsed
      .map((p, i) => ({ p, cat: cats[i] ?? null }))
      .filter(({ p }) => {
        const kind = p.amountCents < 0 ? "expense" : "income";
        return !seen.has(key(p.date, Math.abs(p.amountCents), kind));
      });
    await bulkCreate<Transaction>(
      "transactions",
      fresh.map(({ p, cat }) => ({
        accountId,
        toAccountId: null,
        categoryId: cat,
        kind: p.amountCents < 0 ? ("expense" as const) : ("income" as const),
        amountCents: Math.abs(p.amountCents),
        currency: account?.currency ?? "BRL",
        date: p.date,
        description: p.description,
        tags: ["importado"],
        status: "cleared" as const,
      })),
    );
    setImportedCount(fresh.length);
    setSkippedCount(parsed.length - fresh.length);
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
      <DialogContent title={t("imp.title")}>
        {mode === "idle" && (
          <div className="space-y-4">
            <p className="text-sm text-muted">{t("imp.intro")}</p>
            <Button
              className="w-full"
              disabled={reading}
              onClick={() => fileRef.current?.click()}
            >
              <Upload size={16} />{" "}
              {reading ? t("imp.readingPdf") : t("imp.chooseFile")}
            </Button>
            <p className="flex items-start gap-2 rounded-xl border border-border bg-surface-2/50 p-3 text-xs text-muted">
              <ShieldCheck size={14} className="mt-0.5 shrink-0" />
              {t("imp.pdfLocal")}
            </p>
            {error && <p className="text-sm text-expense">{error}</p>}
          </div>
        )}

        {mode === "password" && (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (pdfFile && pdfPassword) void loadFile(pdfFile, pdfPassword);
            }}
          >
            <div className="flex items-center gap-2 text-sm text-muted">
              <FileText size={16} /> {fileName}
            </div>
            <p className="text-sm">
              {pdfWrongPassword ? t("imp.pdfPasswordWrong") : t("imp.pdfPassword")}
            </p>
            <p className="text-xs text-muted">{t("imp.pdfPasswordHint")}</p>
            <Input
              type="password"
              value={pdfPassword}
              onChange={(e) => setPdfPassword(e.target.value)}
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={reset}>
                {t("common.cancel")}
              </Button>
              <Button type="submit" disabled={!pdfPassword || reading}>
                {reading ? t("imp.readingPdf") : t("common.confirm")}
              </Button>
            </div>
          </form>
        )}

        {(mode === "csv" || mode === "ready") && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm text-muted">
              <FileText size={16} /> {fileName}
            </div>

            <div>
              <Label>{t("imp.destAccount")}</Label>
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
                        ? t("imp.colDate")
                        : key === "description"
                          ? t("imp.colDescription")
                          : t("imp.colAmount")}
                    </Label>
                    <Select
                      value={String(cols[key])}
                      onChange={(e) =>
                        setCols({ ...cols, [key]: Number(e.target.value) })
                      }
                    >
                      {colOptions.map((i) => {
                        const ex = (sampleRow[i] ?? "").trim().slice(0, 18);
                        return (
                          <option key={i} value={i}>
                            {t("imp.column", { n: i + 1 })}
                            {ex ? ` — ${ex}` : ""}
                          </option>
                        );
                      })}
                    </Select>
                  </div>
                ))}
              </div>
            )}

            <div>
              <div className="mb-1 flex items-center justify-between gap-2">
                <p className="text-sm font-medium">
                  {t("imp.recognized", { count: parsed.length })}
                </p>
                {aiAvailable && parsed.length > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={runAiCategorize}
                    disabled={aiBusy || autoFilled === parsed.length}
                  >
                    <Sparkles size={14} />
                    {aiBusy
                      ? t("imp.categorizing")
                      : autoFilled === parsed.length
                        ? t("imp.allCategorized")
                        : t("imp.categorizeRest", {
                            count: parsed.length - autoFilled,
                          })}
                  </Button>
                )}
              </div>
              {autoFilled > 0 && (
                <p className="mb-1 flex items-center gap-1.5 text-xs text-muted">
                  <Wand2 size={13} className="text-primary" />
                  {t("imp.learned", { count: autoFilled })}
                </p>
              )}
              {aiAvailable && pendingForAi.length > 0 && (
                <details className="mb-1 rounded-xl border border-border bg-surface-2/40 px-2.5 py-1.5">
                  <summary className="cursor-pointer text-xs text-muted">
                    <ShieldCheck size={12} className="mr-1 inline" />
                    {t("imp.aiPreviewTitle", { count: pendingForAi.length })}
                  </summary>
                  <p className="mt-1.5 text-[11px] text-muted">
                    {t("imp.aiPreviewNote")}
                  </p>
                  <ul className="mt-1.5 max-h-32 space-y-0.5 overflow-y-auto text-[11px]">
                    {pendingForAi.map((d, i) => (
                      <li key={i} className="truncate font-mono text-muted">
                        {d}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
              {aiError && <p className="mb-1 text-xs text-expense">{aiError}</p>}
              <div className="max-h-48 space-y-1 overflow-y-auto rounded-xl border border-border p-2">
                {parsed.slice(0, 30).map((row, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between gap-2 text-xs"
                  >
                    <span className="min-w-0 truncate text-muted">
                      {row.date} · {row.description}
                      {cats[i] && (
                        <span className="ml-1 text-primary">
                          · {categoryMap.get(cats[i]!) ?? ""}
                        </span>
                      )}
                    </span>
                    <span
                      className="tabular"
                      style={{
                        color:
                          row.amountCents < 0
                            ? "var(--expense)"
                            : "var(--income)",
                      }}
                    >
                      {formatMoney(row.amountCents)}
                    </span>
                  </div>
                ))}
                {parsed.length === 0 && (
                  <p className="text-xs text-muted">
                    {t("imp.nothingRecognized")}
                  </p>
                )}
              </div>
            </div>

            {error && <p className="text-sm text-expense">{error}</p>}

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={reset}>
                {t("imp.changeFile")}
              </Button>
              <Button onClick={confirmImport} disabled={!parsed.length}>
                {t("imp.importN", { count: parsed.length })}
              </Button>
            </div>
          </div>
        )}

        {mode === "done" && (
          <div className="space-y-4 text-center">
            <p className="text-lg font-semibold text-income">
              {t("imp.doneMsg", { count: importedCount })}
            </p>
            {skippedCount > 0 && (
              <p className="text-sm text-muted">
                {t("imp.skipped", { count: skippedCount })}
              </p>
            )}
            <Button
              className="w-full"
              onClick={() => {
                reset();
                onOpenChange(false);
              }}
            >
              {t("imp.finish")}
            </Button>
          </div>
        )}

        <input
          ref={fileRef}
          type="file"
          accept=".csv,.ofx,.txt,.pdf"
          className="hidden"
          onChange={handleFile}
        />
      </DialogContent>
    </Dialog>
  );
}
