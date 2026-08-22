import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Upload,
  FileText,
  Sparkles,
  Wand2,
  ShieldCheck,
  ChevronDown,
  Trash2,
} from "lucide-react";
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
import { cn } from "@/lib/utils";
import {
  parseOfx,
  parseCsvRows,
  guessCsvColumns,
  csvToTransactions,
  parseStatementText,
  parseAmountSigned,
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
  const [aiProgress, setAiProgress] = useState<{
    done: number;
    total: number;
  } | null>(null);

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

  /**
   * Correções feitas na revisão, por índice da linha. Ficam separadas do que
   * foi lido do arquivo: trocar o mapeamento de colunas do CSV recalcula
   * `parsed` e as correções antigas deixam de fazer sentido — por isso o
   * efeito abaixo zera tudo junto com as categorias.
   */
  const [edits, setEdits] = useState<Record<number, Partial<ParsedTx>>>({});
  const [removed, setRemoved] = useState<Set<number>>(new Set());
  const [openRow, setOpenRow] = useState<number | null>(null);
  const [draft, setDraft] = useState<{
    date: string;
    description: string;
    amountText: string;
    categoryId: string;
  } | null>(null);

  /** as linhas como estão AGORA (arquivo + suas correções) */
  const rows: ParsedTx[] = useMemo(
    () => parsed.map((p, i) => ({ ...p, ...edits[i] })),
    [parsed, edits],
  );
  const keptIndexes = useMemo(
    () => rows.map((_, i) => i).filter((i) => !removed.has(i)),
    [rows, removed],
  );

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
    setEdits({});
    setRemoved(new Set());
    setOpenRow(null);
    setDraft(null);
  }, [parsed, learned, categories]);

  const autoFilled = keptIndexes.filter((i) => cats[i]).length;

  /** exatamente o texto que iria pra IA — já mascarado — pra você conferir antes */
  const pendingForAi = useMemo(
    () =>
      redactAll(
        keptIndexes.filter((i) => !cats[i]).map((i) => rows[i].description),
      ).redacted,
    [keptIndexes, rows, cats],
  );

  /* ------------------------ edição de linha (revisão) ----------------------- */

  const centsToText = (cents: number) =>
    (cents / 100).toFixed(2).replace(".", ",");

  function toggleRow(i: number) {
    if (openRow === i) {
      setOpenRow(null);
      setDraft(null);
      return;
    }
    setOpenRow(i);
    setDraft({
      date: rows[i].date,
      description: rows[i].description,
      amountText: centsToText(rows[i].amountCents),
      categoryId: cats[i] ?? "",
    });
  }

  /** Fecha a linha aberta guardando o que foi digitado. */
  function commitDraft() {
    if (openRow === null || !draft) return;
    const i = openRow;
    const amount = parseAmountSigned(draft.amountText);
    setEdits((prev) => ({
      ...prev,
      [i]: {
        date: draft.date || rows[i].date,
        description: draft.description.trim() || rows[i].description,
        // valor inválido não apaga o que veio do arquivo
        amountCents: amount === null || amount === 0 ? rows[i].amountCents : amount,
      },
    }));
    setCats((prev) => {
      const next = [...prev];
      next[i] = draft.categoryId || null;
      return next;
    });
    setOpenRow(null);
    setDraft(null);
  }

  function toggleRemoved(i: number) {
    setRemoved((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
    if (openRow === i) {
      setOpenRow(null);
      setDraft(null);
    }
  }

  /**
   * Extrato de mês inteiro passa fácil de 150 linhas, e mandar tudo numa
   * requisição só estoura o tempo da function na Vercel (o modelo ainda
   * "pensa" antes de responder). Vai em lotes: cada um volta rápido, o
   * resultado aparece na hora e uma falha no meio não joga fora o que já veio.
   */
  const AI_BATCH = 40;

  async function runAiCategorize() {
    if (aiBusy || !keptIndexes.length) return;
    // manda pra IA só o que o histórico não resolveu, e nunca linha removida
    const todo = keptIndexes
      .filter((i) => !cats[i])
      .map((i) => ({ i, description: rows[i].description }));
    if (!todo.length) return;
    setAiBusy(true);
    setAiError("");
    setAiProgress({ done: 0, total: todo.length });
    const catList = categories.map((c) => ({
      id: c.id,
      name: c.name,
      kind: c.kind,
    }));
    try {
      for (let start = 0; start < todo.length; start += AI_BATCH) {
        const batch = todo.slice(start, start + AI_BATCH);
        // CPF, conta, cartão e e-mail saem antes de a descrição deixar o aparelho
        const { redacted } = redactAll(batch.map((x) => x.description));
        const result = await categorizeImport(redacted, catList);
        setCats((prev) => {
          const next = rows.map((_, i) => prev[i] ?? null);
          batch.forEach((x, k) => {
            if (result[k]) next[x.i] = result[k];
          });
          return next;
        });
        setAiProgress({ done: start + batch.length, total: todo.length });
      }
    } catch (e) {
      const code = e instanceof AiError ? e.code : "ai_error";
      // o que já voltou continua preenchido; o aviso é só do que faltou
      setAiError(t(`ai.err.${code}`, { defaultValue: t("ai.err.ai_error") }));
    } finally {
      setAiBusy(false);
      setAiProgress(null);
    }
  }

  async function confirmImport() {
    if (!accountId) {
      setError(t("imp.errDest"));
      return;
    }
    if (!keptIndexes.length) {
      setError(t("imp.errNone"));
      return;
    }

    /*
     * A linha que ficou ABERTA também vale: o usuário pode digitar e clicar
     * direto em "Importar". Aplicamos o rascunho aqui num array local — não dá
     * pra confiar no setState do commitDraft, que só chega no próximo render.
     */
    const finalRows = [...rows];
    const finalCats = [...cats];
    if (openRow !== null && draft) {
      const amount = parseAmountSigned(draft.amountText);
      finalRows[openRow] = {
        date: draft.date || rows[openRow].date,
        description: draft.description.trim() || rows[openRow].description,
        amountCents:
          amount === null || amount === 0 ? rows[openRow].amountCents : amount,
      };
      finalCats[openRow] = draft.categoryId || null;
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
    const fresh = keptIndexes
      .map((i) => ({ p: finalRows[i], cat: finalCats[i] ?? null }))
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
    setSkippedCount(keptIndexes.length - fresh.length);
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
                  {t("imp.recognized", { count: keptIndexes.length })}
                </p>
                {aiAvailable && keptIndexes.length > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={runAiCategorize}
                    disabled={aiBusy || autoFilled === keptIndexes.length}
                  >
                    <Sparkles size={14} />
                    {aiBusy
                      ? aiProgress
                        ? t("imp.categorizingN", aiProgress)
                        : t("imp.categorizing")
                      : autoFilled === keptIndexes.length
                        ? t("imp.allCategorized")
                        : t("imp.categorizeRest", {
                            count: keptIndexes.length - autoFilled,
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
              {rows.length > 0 && (
                <p className="mb-1 text-[11px] text-muted">
                  {t("imp.editHint")}
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
              <div className="max-h-64 space-y-0.5 overflow-y-auto rounded-xl border border-border p-2">
                {rows.map((row, i) => {
                  const isRemoved = removed.has(i);
                  const isOpen = openRow === i;
                  const wasEdited = !!edits[i];
                  return (
                    <div key={i}>
                      <div
                        role="button"
                        tabIndex={isRemoved ? -1 : 0}
                        onClick={() => !isRemoved && toggleRow(i)}
                        onKeyDown={(e) => {
                          if (isRemoved) return;
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            toggleRow(i);
                          }
                        }}
                        className={cn(
                          "flex items-center justify-between gap-2 rounded-lg px-1.5 py-1 text-xs",
                          isRemoved
                            ? "opacity-50"
                            : "cursor-pointer hover:bg-surface-2",
                          isOpen && "bg-surface-2",
                        )}
                      >
                        <span className="min-w-0 truncate text-muted">
                          <span className={isRemoved ? "line-through" : ""}>
                            {row.date} · {row.description}
                          </span>
                          {!isRemoved && cats[i] && (
                            <span className="ml-1 text-primary">
                              · {categoryMap.get(cats[i]!) ?? ""}
                            </span>
                          )}
                          {wasEdited && !isRemoved && (
                            <span className="ml-1.5 rounded border border-border px-1 py-px text-[9px] text-muted">
                              {t("imp.edited")}
                            </span>
                          )}
                        </span>
                        <span className="flex shrink-0 items-center gap-1.5">
                          {isRemoved && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleRemoved(i);
                              }}
                              className="text-[11px] text-primary hover:underline"
                            >
                              {t("imp.undo")}
                            </button>
                          )}
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
                          {!isRemoved && (
                            <ChevronDown
                              size={12}
                              className={cn(
                                "text-muted transition-transform",
                                isOpen && "rotate-180",
                              )}
                            />
                          )}
                        </span>
                      </div>

                      {isOpen && draft && (
                        <div className="my-1 rounded-xl border border-primary bg-surface p-2.5">
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <Label className="text-[10px]">
                                {t("imp.colDate")}
                              </Label>
                              <Input
                                type="date"
                                value={draft.date}
                                onChange={(e) =>
                                  setDraft({ ...draft, date: e.target.value })
                                }
                              />
                            </div>
                            <div>
                              <Label className="text-[10px]">
                                {t("imp.colAmount")}
                              </Label>
                              <Input
                                inputMode="decimal"
                                value={draft.amountText}
                                onChange={(e) =>
                                  setDraft({
                                    ...draft,
                                    amountText: e.target.value,
                                  })
                                }
                              />
                            </div>
                            <div className="col-span-2">
                              <Label className="text-[10px]">
                                {t("imp.colDescription")}
                              </Label>
                              <Input
                                value={draft.description}
                                onChange={(e) =>
                                  setDraft({
                                    ...draft,
                                    description: e.target.value,
                                  })
                                }
                              />
                            </div>
                            <div className="col-span-2">
                              <Label className="text-[10px]">
                                {t("tx.category")}
                              </Label>
                              <Select
                                value={draft.categoryId}
                                onChange={(e) =>
                                  setDraft({
                                    ...draft,
                                    categoryId: e.target.value,
                                  })
                                }
                              >
                                <option value="">{t("tx.noCategory")}</option>
                                {categories.map((c) => (
                                  <option key={c.id} value={c.id}>
                                    {c.name}
                                  </option>
                                ))}
                              </Select>
                            </div>
                          </div>
                          <div className="mt-2.5 flex items-center justify-between">
                            <button
                              type="button"
                              onClick={() => toggleRemoved(i)}
                              className="flex items-center gap-1 text-[11px] text-muted hover:text-expense"
                            >
                              <Trash2 size={12} /> {t("imp.removeRow")}
                            </button>
                            <Button size="sm" onClick={commitDraft}>
                              {t("imp.rowDone")}
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
                {rows.length === 0 && (
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
              <Button onClick={confirmImport} disabled={!keptIndexes.length}>
                {t("imp.importN", { count: keptIndexes.length })}
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
