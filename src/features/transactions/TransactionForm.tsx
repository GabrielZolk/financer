import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import {
  Button,
  Input,
  Label,
  Select,
  Textarea,
} from "@/components/ui/primitives";
import { cn, confirmDelete } from "@/lib/utils";
import { parseMoney, formatMoney } from "@/lib/money";
import { create, update, softDelete, bulkCreate } from "@/db/repo";
import { useAccounts, useCategories, useAllTags } from "@/db/hooks";
import { db } from "@/db/schema";
import type {
  Attachment,
  Category,
  Recurrence,
  RecurrenceFrequency,
  Transaction,
  TransactionKind,
} from "@/db/types";
import { nextOccurrence } from "@/lib/recurrence";
import { Trash2, Paperclip, X, Split as SplitIcon, Repeat, Copy } from "lucide-react";
import { addMonths, parseISO, format } from "date-fns";
import { uid } from "@/lib/utils";
import { celebrate } from "@/components/feedback/Feito";
import { CategoryForm } from "@/features/categories/CategoryForm";
import { AccountSelect } from "@/features/accounts/AccountSelect";
import { usePrivacy, encryptPayload, cacheDecrypted } from "@/lib/privacy";
import { Lock } from "lucide-react";

/** Divide um total em N parcelas inteiras; a sobra (centavos) vai na 1ª. */
function splitCents(total: number, n: number): number[] {
  const base = Math.floor(total / n);
  const rest = total - base * n;
  return Array.from({ length: n }, (_, i) => (i === 0 ? base + rest : base));
}

/** Linha do editor de divisão (estado do formulário). */
interface SplitRow {
  categoryId: string;
  description: string;
  quantity: string;
  unit: string;
  note: string;
  tags: string;
  date: string;
  showDetails: boolean;
}
function emptyRow(over: Partial<SplitRow> = {}): SplitRow {
  return {
    categoryId: "",
    description: "",
    quantity: "1",
    unit: "",
    note: "",
    tags: "",
    date: "",
    showDetails: false,
    ...over,
  };
}
/** Subtotal do item = quantidade × valor unitário (em centavos). */
function rowSubtotal(r: SplitRow): number {
  const q = parseFloat((r.quantity || "1").replace(",", ".")) || 0;
  const u = parseMoney(r.unit) ?? 0;
  return Math.round(q * u);
}
function parseTags(s: string): string[] {
  return s
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}

const KINDS: { value: TransactionKind; label: string }[] = [
  { value: "expense", label: "Despesa" },
  { value: "income", label: "Receita" },
  { value: "transfer", label: "Transferência" },
];

const FREQ: { value: RecurrenceFrequency; label: string }[] = [
  { value: "monthly", label: "Mensal" },
  { value: "weekly", label: "Semanal" },
  { value: "biweekly", label: "Quinzenal" },
  { value: "daily", label: "Diária" },
  { value: "yearly", label: "Anual" },
];

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function TransactionForm({
  open,
  onOpenChange,
  editing,
  duplicateFrom,
  defaultAccountId,
  onDuplicate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing?: Transaction;
  /** prefilla os campos como um lançamento NOVO (duplicar) */
  duplicateFrom?: Transaction;
  defaultAccountId?: string;
  /** pede ao pai pra reabrir o form duplicando este lançamento */
  onDuplicate?: (tx: Transaction) => void;
}) {
  const accounts = useAccounts();
  const allTags = useAllTags();
  const privacy = usePrivacy();
  const [isPrivate, setIsPrivate] = useState(false);
  const [kind, setKind] = useState<TransactionKind>("expense");
  const categories = useCategories(kind === "transfer" ? undefined : kind);

  const [amount, setAmount] = useState("");
  const [accountId, setAccountId] = useState("");
  const [toAccountId, setToAccountId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [date, setDate] = useState(today());
  const [rangeMode, setRangeMode] = useState(false);
  const [endDate, setEndDate] = useState("");
  const [description, setDescription] = useState("");
  const [notes, setNotes] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [pending, setPending] = useState(false);
  const [isReimbursable, setIsReimbursable] = useState(false);
  const [isReimbursed, setIsReimbursed] = useState(false);
  const [estornoOpen, setEstornoOpen] = useState(false);
  const [estornoValue, setEstornoValue] = useState("");
  const [installments, setInstallments] = useState(1);
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const [existingAttachment, setExistingAttachment] = useState<Attachment | null>(
    null,
  );
  const [removeAttachment, setRemoveAttachment] = useState(false);
  const [splitMode, setSplitMode] = useState(false);
  const [splits, setSplits] = useState<SplitRow[]>([]);
  const [repeat, setRepeat] = useState(false);
  const [repeatFreq, setRepeatFreq] = useState<RecurrenceFrequency>("monthly");
  const [repeatEnd, setRepeatEnd] = useState("");
  const [error, setError] = useState("");
  // criação inline de categoria: alvo = "main" ou índice do item da divisão
  const [catFormOpen, setCatFormOpen] = useState(false);
  const [catTarget, setCatTarget] = useState<"main" | number>("main");

  /** trata a escolha do select de categoria, abrindo o form se for "+ nova". */
  function onPickCategory(value: string, target: "main" | number) {
    if (value === "__new__") {
      setCatTarget(target);
      setCatFormOpen(true);
      return;
    }
    if (target === "main") setCategoryId(value);
    else setSplit(target, "categoryId", value);
  }

  function handleCategoryCreated(cat: Category) {
    if (catTarget === "main") setCategoryId(cat.id);
    else setSplit(catTarget, "categoryId", cat.id);
  }

  /** adiciona uma tag existente ao campo (sem duplicar). */
  function addTag(tag: string) {
    const cur = parseTags(tagsInput);
    if (cur.includes(tag)) return;
    setTagsInput([...cur, tag].join(", "));
  }

  const selectedAccount = accounts.find((a) => a.id === accountId);
  const isCard = selectedAccount?.type === "credit_card";
  const canInstall = isCard && kind === "expense" && !editing;
  const attachInputRef = useRef<HTMLInputElement>(null);

  function openAttachment(blob: Blob) {
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank");
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  const canSplit = kind !== "transfer" && !(canInstall && installments > 1);
  const splitSum = splits.reduce((s, r) => s + rowSubtotal(r), 0);

  function enterSplit() {
    // primeiro item já com o valor total; o usuário ajusta/adiciona
    setSplits([
      emptyRow({ categoryId, description: "", unit: amount }),
      emptyRow(),
    ]);
    setSplitMode(true);
  }
  function exitSplit() {
    setSplitMode(false);
    setSplits([]);
  }
  function addSplit() {
    setSplits((arr) => [...arr, emptyRow()]);
  }
  function removeSplit(i: number) {
    setSplits((arr) => arr.filter((_, idx) => idx !== i));
  }
  function setSplit(i: number, field: keyof SplitRow, value: string | boolean) {
    setSplits((arr) =>
      arr.map((r, idx) => (idx === i ? { ...r, [field]: value } : r)),
    );
  }

  // (re)inicializa o formulário quando abre.
  // src = editar OU duplicar (duplicar prefilla tudo, mas salva como NOVO)
  useEffect(() => {
    if (!open) return;
    const src = editing ?? duplicateFrom;
    if (src) {
      setKind(src.kind);
      setAmount((src.amountCents / 100).toString().replace(".", ","));
      setAccountId(src.accountId);
      setToAccountId(src.toAccountId ?? "");
      setCategoryId(src.categoryId ?? "");
      setDate(src.date);
      setRangeMode(!!src.endDate);
      setEndDate(src.endDate ?? "");
      setIsPrivate(src.private === 1);
      setDescription(src.description);
      setNotes(src.notes ?? "");
      setTagsInput((src.tags ?? []).join(", "));
      setPending(src.status === "pending");
      setIsReimbursable(src.reimbursable === 1);
      setIsReimbursed(src.reimbursed === 1);
      if (src.splits?.length) {
        setSplitMode(true);
        setSplits(
          src.splits.map((s) => {
            const unitCents = s.unitAmountCents ?? s.amountCents;
            return emptyRow({
              categoryId: s.categoryId ?? "",
              description: s.description ?? "",
              quantity: String(s.quantity ?? 1),
              unit: (unitCents / 100).toString().replace(".", ","),
              note: s.note ?? "",
              tags: (s.tags ?? []).join(", "),
              date: s.date ?? "",
              showDetails: !!(s.note || s.tags?.length || s.date),
            });
          }),
        );
      } else {
        setSplitMode(false);
        setSplits([]);
      }
    } else {
      setKind("expense");
      setAmount("");
      setAccountId(defaultAccountId ?? accounts[0]?.id ?? "");
      setToAccountId("");
      setCategoryId("");
      setDate(today());
      setRangeMode(false);
      setEndDate("");
      setIsPrivate(false);
      setDescription("");
      setNotes("");
      setTagsInput("");
      setPending(false);
      setIsReimbursable(false);
      setIsReimbursed(false);
      setSplitMode(false);
      setSplits([]);
    }
    setInstallments(1);
    setRepeat(false);
    setRepeatFreq("monthly");
    setRepeatEnd("");
    setEstornoOpen(false);
    setEstornoValue("");
    setAttachmentFile(null);
    setRemoveAttachment(false);
    setExistingAttachment(null);
    // só carrega anexo existente ao EDITAR (duplicar começa sem anexo)
    if (editing) {
      db.attachments
        .where("transactionId")
        .equals(editing.id)
        .first()
        .then((att) => {
          if (att && att.deleted === 0) setExistingAttachment(att);
        });
    }
    setError("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing, duplicateFrom]);

  // garante uma conta selecionada quando elas carregam (respeita defaultAccountId)
  useEffect(() => {
    if (open && !accountId && accounts[0])
      setAccountId(defaultAccountId ?? accounts[0].id);
  }, [open, accountId, accounts, defaultAccountId]);

  const cents = parseMoney(amount);

  async function handleSubmit() {
    setError("");
    if (cents === null || cents <= 0) {
      setError("Informe um valor válido.");
      return;
    }
    if (!accountId) {
      setError("Selecione uma conta.");
      return;
    }
    if (kind === "transfer" && (!toAccountId || toAccountId === accountId)) {
      setError("Selecione uma conta de destino diferente.");
      return;
    }
    if (rangeMode && endDate && endDate < date) {
      setError("A data final precisa ser igual ou depois do início.");
      return;
    }

    // validação do lançamento dividido
    let splitData: Transaction["splits"] = undefined;
    if (splitMode && canSplit) {
      const parsed = splits
        .map((r) => {
          const qty = parseFloat((r.quantity || "1").replace(",", ".")) || 1;
          const unitCents = parseMoney(r.unit) ?? 0;
          const tags = parseTags(r.tags);
          return {
            categoryId: r.categoryId || null,
            amountCents: rowSubtotal(r),
            description: r.description.trim() || undefined,
            note: r.note.trim() || undefined,
            quantity: qty !== 1 ? qty : undefined,
            unitAmountCents: qty !== 1 ? unitCents : undefined,
            tags: tags.length ? tags : undefined,
            date: r.date && r.date !== date ? r.date : undefined,
          };
        })
        .filter((s) => s.amountCents > 0);
      if (parsed.length < 2) {
        setError("A divisão precisa de pelo menos 2 itens com valor.");
        return;
      }
      if (splitSum !== cents) {
        const diff = (cents - splitSum) / 100;
        setError(
          `A soma das partes (${formatMoney(splitSum)}) precisa bater com o total. Faltam ${formatMoney(Math.abs(cents - splitSum))}${diff < 0 ? " a menos" : ""}.`,
        );
        return;
      }
      splitData = parsed;
    }

    const account = accounts.find((a) => a.id === accountId);
    const base = {
      accountId,
      toAccountId: kind === "transfer" ? toAccountId : null,
      categoryId:
        kind === "transfer" ? null : splitData ? null : categoryId || null,
      kind,
      amountCents: cents,
      currency: account?.currency ?? "BRL",
      date,
      endDate: rangeMode && endDate ? endDate : null,
      description: description.trim() || defaultDescription(kind),
      notes: notes.trim() || undefined,
      tags: parseTags(tagsInput),
      status: pending ? ("pending" as const) : ("cleared" as const),
      splits: splitData,
      reimbursable:
        kind === "expense" && isReimbursable ? (1 as const) : (0 as const),
      reimbursed:
        kind === "expense" && isReimbursable && isReimbursed
          ? (1 as const)
          : (0 as const),
    };

    // privacidade: cifra os campos sensíveis e salva uma "casca" com valor 0
    let toSave: Record<string, unknown> = base;
    let sensitive: Record<string, unknown> | null = null;
    if (isPrivate) {
      if (!privacy.unlocked) {
        setError(
          "Destrave a privacidade (cadeado no topo) para salvar um lançamento privado.",
        );
        return;
      }
      sensitive = {
        description: base.description,
        notes: base.notes,
        amountCents: base.amountCents,
        kind: base.kind,
        categoryId: base.categoryId,
        toAccountId: base.toAccountId,
        status: base.status,
        tags: base.tags,
        splits: base.splits,
      };
      const cipher = await encryptPayload(sensitive);
      toSave = {
        ...base,
        amountCents: 0,
        kind: "expense",
        categoryId: null,
        toAccountId: null,
        splits: undefined,
        tags: [],
        description: "",
        notes: undefined,
        status: "cleared",
        private: 1,
        enc: cipher.ct,
        iv: cipher.iv,
      };
    }

    const doInstall = canInstall && installments > 1 && !isPrivate;
    let txId: string | undefined = editing?.id;
    if (editing) {
      await update<Transaction>("transactions", editing.id, toSave as never);
    } else if (doInstall) {
      // gera N parcelas mensais a partir da data informada
      const groupId = uid();
      const parts = splitCents(cents, installments);
      const start = parseISO(date);
      const items = parts.map((amountCents, i) => ({
        ...base,
        amountCents,
        date: format(addMonths(start, i), "yyyy-MM-dd"),
        description: `${base.description} (${i + 1}/${installments})`,
        installmentId: groupId,
        installmentNo: i + 1,
        installmentTotal: installments,
      }));
      await bulkCreate<Transaction>("transactions", items);
      txId = undefined; // anexo não se aplica a parcelamento
    } else {
      const created = await create<Transaction>("transactions", toSave as never);
      txId = created.id;
    }

    // mantém o item decifrado no cache (aparece na hora, no modo certo)
    if (isPrivate && sensitive && txId) cacheDecrypted(txId, sensitive);

    // repetir: cria uma recorrência a partir deste lançamento (não em edição,
    // parcelamento ou privado). A 1ª ocorrência é este lançamento; a próxima
    // já fica agendada pra data seguinte.
    if (repeat && !editing && !doInstall && !isPrivate) {
      await create<Recurrence>("recurrences", {
        description: base.description,
        kind: base.kind,
        amountCents: base.amountCents,
        accountId: base.accountId,
        toAccountId: base.toAccountId ?? null,
        categoryId: base.categoryId,
        frequency: repeatFreq,
        nextDate: nextOccurrence(date, repeatFreq),
        endDate: repeatEnd || null,
        active: 1,
      });
    }

    // anexo de comprovante (guardado localmente)
    if (txId) {
      if (existingAttachment && removeAttachment) {
        await softDelete("attachments", existingAttachment.id);
      }
      if (attachmentFile) {
        await create<Attachment>("attachments", {
          transactionId: txId,
          filename: attachmentFile.name,
          mimeType: attachmentFile.type,
          sizeBytes: attachmentFile.size,
          blob: attachmentFile,
        });
      }
    }

    onOpenChange(false);
    celebrate("check");
  }

  async function handleDelete() {
    if (editing && confirmDelete("este lançamento")) {
      await softDelete("transactions", editing.id);
      onOpenChange(false);
    }
  }

  /** Registra um estorno/devolução (parcial ou total) da compra que está sendo
   *  editada: cria uma receita na mesma conta. Na fatura do cartão, abate o total. */
  async function handleEstorno() {
    if (!editing) return;
    const v = parseMoney(estornoValue);
    if (!v || v <= 0) {
      setError("Informe o valor do estorno.");
      return;
    }
    if (v > editing.amountCents) {
      setError("O estorno não pode ser maior que a compra.");
      return;
    }
    const acc = accounts.find((a) => a.id === editing.accountId);
    await create<Transaction>("transactions", {
      accountId: editing.accountId,
      toAccountId: null,
      categoryId: editing.categoryId ?? null,
      kind: "income",
      amountCents: v,
      currency: acc?.currency ?? editing.currency,
      date: new Date().toISOString().slice(0, 10),
      description: `Estorno: ${editing.description}`,
      tags: ["estorno"],
      status: "cleared",
    });
    onOpenChange(false);
    celebrate("coin", `Estorno de ${formatMoney(v)}`);
  }

  async function handleDeleteGroup() {
    if (!editing?.installmentId) return;
    if (!confirmDelete(`todas as ${editing.installmentTotal ?? ""} parcelas`.trim()))
      return;
    const group = await db.transactions
      .where("installmentId")
      .equals(editing.installmentId)
      .toArray();
    for (const t of group) await softDelete("transactions", t.id);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={editing ? "Editar lançamento" : "Novo lançamento"}>
        <div className="space-y-4">
          {/* Tipo */}
          <div className="grid grid-cols-3 gap-1 rounded-xl bg-surface-2 p-1">
            {KINDS.map((k) => (
              <button
                key={k.value}
                onClick={() => setKind(k.value)}
                className={cn(
                  "rounded-lg py-2 text-sm font-medium transition-colors",
                  kind === k.value
                    ? "bg-surface shadow-sm"
                    : "text-muted hover:text-text",
                  kind === k.value && k.value === "income" && "text-income",
                  kind === k.value && k.value === "expense" && "text-expense",
                )}
              >
                {k.label}
              </button>
            ))}
          </div>

          {/* Parcelamento (gerenciar o grupo) */}
          {editing?.installmentId && (
            <div className="flex items-center justify-between gap-2 rounded-xl border border-border bg-surface-2/40 p-3 text-sm">
              <span>
                Parcela <b>{editing.installmentNo}/{editing.installmentTotal}</b>{" "}
                deste parcelamento.
              </span>
              <button
                type="button"
                onClick={handleDeleteGroup}
                className="shrink-0 text-xs font-medium text-expense hover:underline"
              >
                Excluir todas
              </button>
            </div>
          )}

          {/* Registrar estorno/devolução (editando uma despesa) */}
          {editing && kind === "expense" && (
            <div className="rounded-xl border border-border bg-surface-2/40 p-3">
              {!estornoOpen ? (
                <button
                  type="button"
                  onClick={() => {
                    setEstornoValue(
                      (editing.amountCents / 100).toString().replace(".", ","),
                    );
                    setEstornoOpen(true);
                  }}
                  className="flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
                >
                  ↩ Registrar estorno / devolução
                </button>
              ) : (
                <div className="space-y-2">
                  <Label className="mb-0">Valor estornado (parcial ou total)</Label>
                  <Input
                    inputMode="decimal"
                    placeholder="0,00"
                    value={estornoValue}
                    onChange={(e) => setEstornoValue(e.target.value)}
                    className="tabular"
                    autoFocus
                  />
                  <p className="text-xs text-muted">
                    Cria uma devolução nesta conta. No cartão, abate o valor da
                    fatura.
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setEstornoOpen(false)}
                    >
                      Cancelar
                    </Button>
                    <Button size="sm" onClick={handleEstorno}>
                      Registrar estorno
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Valor */}
          <div>
            <Label>Valor</Label>
            <Input
              inputMode="decimal"
              placeholder="0,00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="text-lg font-semibold tabular"
              autoFocus
            />
            {cents !== null && cents > 0 && (
              <p className="mt-1 text-xs text-muted">{formatMoney(cents)}</p>
            )}
          </div>

          {/* Conta(s) */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>{kind === "transfer" ? "De" : "Conta"}</Label>
              <AccountSelect
                value={accountId}
                onChange={setAccountId}
                accounts={accounts}
              />
            </div>
            {kind === "transfer" ? (
              <div>
                <Label>Para</Label>
                <AccountSelect
                  value={toAccountId}
                  onChange={setToAccountId}
                  accounts={accounts}
                  exclude={accountId}
                  includeNone
                  noneLabel="Selecione…"
                />
              </div>
            ) : (
              <div>
                <Label>Categoria</Label>
                {splitMode ? (
                  <div className="flex h-10 items-center rounded-xl border border-border bg-surface-2 px-3 text-sm text-muted">
                    Dividido em {splits.length}
                  </div>
                ) : (
                  <Select
                    value={categoryId}
                    onChange={(e) => onPickCategory(e.target.value, "main")}
                  >
                    <option value="">Sem categoria</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                    <option value="__new__">+ Nova categoria…</option>
                  </Select>
                )}
              </div>
            )}
          </div>

          {/* Dividir em categorias */}
          {canSplit &&
            (!splitMode ? (
              <button
                type="button"
                onClick={enterSplit}
                className="flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
              >
                <SplitIcon size={15} /> Dividir em categorias
              </button>
            ) : (
              <div className="rounded-xl border border-border bg-surface-2/40 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-sm font-medium">Divisão</span>
                  <button
                    type="button"
                    onClick={exitSplit}
                    className="text-xs text-muted hover:text-expense"
                  >
                    Remover divisão
                  </button>
                </div>
                <div className="space-y-2.5">
                  {splits.map((row, i) => (
                    <div
                      key={i}
                      className="space-y-2 rounded-lg border border-border bg-surface p-2.5"
                    >
                      <div className="flex items-center gap-2">
                        <Input
                          placeholder="Descrição do item"
                          value={row.description}
                          onChange={(e) =>
                            setSplit(i, "description", e.target.value)
                          }
                          className="h-9 flex-1 text-sm"
                        />
                        <button
                          type="button"
                          onClick={() => removeSplit(i)}
                          className="shrink-0 text-muted hover:text-expense"
                          aria-label="Remover item"
                        >
                          <X size={16} />
                        </button>
                      </div>
                      <div className="flex items-center gap-2">
                        <Select
                          value={row.categoryId}
                          onChange={(e) => onPickCategory(e.target.value, i)}
                          className="h-9 min-w-0 flex-1 text-sm"
                        >
                          <option value="">Sem categoria</option>
                          {categories.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                          <option value="__new__">+ Nova categoria…</option>
                        </Select>
                        <Input
                          inputMode="numeric"
                          value={row.quantity}
                          onChange={(e) =>
                            setSplit(i, "quantity", e.target.value)
                          }
                          className="h-9 w-11 px-1 text-center text-sm tabular"
                          aria-label="Quantidade"
                        />
                        <span className="text-sm text-muted">×</span>
                        <Input
                          inputMode="decimal"
                          placeholder="0,00"
                          value={row.unit}
                          onChange={(e) => setSplit(i, "unit", e.target.value)}
                          className="h-9 w-[88px] text-right text-sm tabular"
                          aria-label="Valor unitário"
                        />
                      </div>
                      <div className="flex items-center justify-between">
                        <button
                          type="button"
                          onClick={() =>
                            setSplit(i, "showDetails", !row.showDetails)
                          }
                          className="text-xs text-muted hover:text-text"
                        >
                          {row.showDetails ? "− menos" : "+ detalhes"}
                        </button>
                        <span className="text-xs tabular text-muted">
                          {formatMoney(rowSubtotal(row))}
                        </span>
                      </div>
                      {row.showDetails && (
                        <div className="space-y-2 border-t border-border pt-2">
                          <Input
                            placeholder="Observação"
                            value={row.note}
                            onChange={(e) => setSplit(i, "note", e.target.value)}
                            className="h-9 text-sm"
                          />
                          <Input
                            placeholder="Tags (separadas por vírgula)"
                            value={row.tags}
                            onChange={(e) => setSplit(i, "tags", e.target.value)}
                            className="h-9 text-sm"
                          />
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted">Data:</span>
                            <Input
                              type="date"
                              value={row.date || date}
                              onChange={(e) => setSplit(i, "date", e.target.value)}
                              className="h-9 flex-1 text-sm"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <button
                    type="button"
                    onClick={addSplit}
                    className="text-sm font-medium text-primary hover:underline"
                  >
                    + Adicionar item
                  </button>
                  <span
                    className="text-xs tabular"
                    style={{
                      color:
                        cents !== null && splitSum === cents
                          ? "var(--income)"
                          : "var(--muted)",
                    }}
                  >
                    {formatMoney(splitSum)}
                    {cents !== null ? ` / ${formatMoney(cents)}` : ""}
                  </span>
                </div>
              </div>
            ))}

          {/* Data (única ou período) */}
          <div>
            <div className="mb-1 flex items-center justify-between">
              <Label className="mb-0">{rangeMode ? "Período" : "Data"}</Label>
              <button
                type="button"
                onClick={() => {
                  if (!rangeMode && !endDate) setEndDate(date);
                  setRangeMode((v) => !v);
                }}
                className="text-xs font-medium text-primary hover:underline"
              >
                {rangeMode ? "− período" : "+ período"}
              </button>
            </div>
            {rangeMode ? (
              <div className="flex items-center gap-2">
                <Input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="flex-1"
                />
                <span className="text-sm text-muted">até</span>
                <Input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="flex-1"
                />
              </div>
            ) : (
              <Input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            )}
          </div>

          <div>
            <Label>Descrição</Label>
            <Input
              placeholder="Opcional"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div>
            <Label>Observações</Label>
            <Textarea
              placeholder="Opcional"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          <div>
            <Label>Tags</Label>
            <Input
              placeholder="Separadas por vírgula (ex.: trabalho, reembolsável)"
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
            />
            {/* sugere tags já usadas pra reaproveitar (evita duplicadas); digitar cria nova */}
            {(() => {
              const used = parseTags(tagsInput);
              const sugg = allTags.filter((t) => !used.includes(t)).slice(0, 8);
              if (sugg.length === 0) return null;
              return (
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {sugg.map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => addTag(t)}
                      className="rounded-full bg-surface-2 px-2.5 py-1 text-xs text-muted transition-colors hover:text-text"
                    >
                      + {t}
                    </button>
                  ))}
                </div>
              );
            })()}
          </div>

          {/* Repetir (cria recorrência a partir deste lançamento) */}
          {!editing && !isPrivate && !(canInstall && installments > 1) && (
            <div className="rounded-xl border border-border bg-surface-2/40 p-3">
              <label className="flex items-center gap-2 text-sm font-medium">
                <input
                  type="checkbox"
                  checked={repeat}
                  onChange={(e) => setRepeat(e.target.checked)}
                  className="h-4 w-4 rounded border-border"
                />
                <Repeat size={15} className="text-primary" /> Repetir automaticamente
              </label>
              {repeat && (
                <div className="mt-3 space-y-2">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Frequência</Label>
                      <Select
                        value={repeatFreq}
                        onChange={(e) =>
                          setRepeatFreq(e.target.value as RecurrenceFrequency)
                        }
                      >
                        {FREQ.map((f) => (
                          <option key={f.value} value={f.value}>
                            {f.label}
                          </option>
                        ))}
                      </Select>
                    </div>
                    <div>
                      <Label>Terminar em (opcional)</Label>
                      <Input
                        type="date"
                        value={repeatEnd}
                        onChange={(e) => setRepeatEnd(e.target.value)}
                      />
                    </div>
                  </div>
                  <p className="text-xs text-muted">
                    Lança hoje e repete{" "}
                    {FREQ.find((f) => f.value === repeatFreq)?.label.toLowerCase()} a
                    partir de {formatBR(nextOccurrence(date, repeatFreq))}. Gerencie
                    em Ajustes ▸ Recorrências.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Anexo (comprovante) */}
          <div>
            <Label>Comprovante</Label>
            {existingAttachment && !removeAttachment ? (
              <div className="flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm">
                <Paperclip size={16} className="text-muted" />
                <button
                  type="button"
                  className="flex-1 truncate text-left text-primary hover:underline"
                  onClick={() =>
                    existingAttachment.blob &&
                    openAttachment(existingAttachment.blob)
                  }
                >
                  {existingAttachment.filename}
                </button>
                <button
                  type="button"
                  onClick={() => setRemoveAttachment(true)}
                  className="text-muted hover:text-expense"
                >
                  <X size={16} />
                </button>
              </div>
            ) : attachmentFile ? (
              <div className="flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm">
                <Paperclip size={16} className="text-muted" />
                <span className="flex-1 truncate">{attachmentFile.name}</span>
                <button
                  type="button"
                  onClick={() => setAttachmentFile(null)}
                  className="text-muted hover:text-expense"
                >
                  <X size={16} />
                </button>
              </div>
            ) : (
              <Button
                type="button"
                variant="outline"
                onClick={() => attachInputRef.current?.click()}
              >
                <Paperclip size={16} /> Anexar foto/PDF
              </Button>
            )}
            <input
              ref={attachInputRef}
              type="file"
              accept="image/*,application/pdf"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) {
                  setAttachmentFile(f);
                  setRemoveAttachment(true); // substitui o existente, se houver
                }
                e.target.value = "";
              }}
            />
          </div>

          {canInstall && !splitMode && (
            <div>
              <Label>Parcelas</Label>
              <Select
                value={String(installments)}
                onChange={(e) => setInstallments(Number(e.target.value))}
              >
                {Array.from({ length: 24 }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={n}>
                    {n}x
                  </option>
                ))}
              </Select>
              {installments > 1 && cents !== null && cents > 0 && (
                <p className="mt-1 text-xs text-muted">
                  {installments}x de{" "}
                  {formatMoney(Math.floor(cents / installments))} (mensal)
                </p>
              )}
            </div>
          )}

          <label className="flex items-center gap-2 text-sm text-muted">
            <input
              type="checkbox"
              checked={pending}
              onChange={(e) => setPending(e.target.checked)}
              className="h-4 w-4 rounded border-border"
            />
            Lançamento pendente (não conta no saldo efetivado)
          </label>

          {kind === "expense" && (
            <div>
              <label className="flex items-center gap-2 text-sm text-muted">
                <input
                  type="checkbox"
                  checked={isReimbursable}
                  onChange={(e) => setIsReimbursable(e.target.checked)}
                  className="h-4 w-4 rounded border-border"
                />
                Reembolsável (a empresa/alguém me devolve)
              </label>
              {isReimbursable && (
                <label className="mt-2 ml-6 flex items-center gap-2 text-sm text-muted">
                  <input
                    type="checkbox"
                    checked={isReimbursed}
                    onChange={(e) => setIsReimbursed(e.target.checked)}
                    className="h-4 w-4 rounded border-border"
                  />
                  Já recebi o reembolso
                </label>
              )}
            </div>
          )}

          {kind !== "transfer" && (
            <div>
              <label className="flex items-center gap-2 text-sm text-muted">
                <input
                  type="checkbox"
                  checked={isPrivate}
                  onChange={(e) => setIsPrivate(e.target.checked)}
                  className="h-4 w-4 rounded border-border"
                />
                <Lock size={14} /> Lançamento privado (cifrado, oculto no modo
                discreto)
              </label>
              {isPrivate && !privacy.unlocked && (
                <p className="mt-1 text-xs text-expense">
                  Crie/destrave o PIN no cadeado 🔒 do topo para salvar um item
                  privado.
                </p>
              )}
            </div>
          )}

          {error && <p className="text-sm text-expense">{error}</p>}

          <div className="flex items-center justify-between gap-2 pt-2">
            <div className="flex gap-1">
              {editing && (
                <Button variant="ghost" size="icon" onClick={handleDelete} title="Excluir">
                  <Trash2 size={18} className="text-expense" />
                </Button>
              )}
              {editing && onDuplicate && (
                <Button
                  variant="ghost"
                  size="icon"
                  title="Duplicar"
                  onClick={() => onDuplicate(editing)}
                >
                  <Copy size={18} className="text-muted" />
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button onClick={handleSubmit}>Salvar</Button>
            </div>
          </div>
        </div>

        {/* criação inline de categoria (a partir do seletor) */}
        <CategoryForm
          open={catFormOpen}
          onOpenChange={setCatFormOpen}
          defaultKind={kind === "transfer" ? "expense" : kind}
          onCreated={handleCategoryCreated}
        />
      </DialogContent>
    </Dialog>
  );
}

function formatBR(date: string): string {
  const [y, m, d] = date.split("-");
  return `${d}/${m}/${y.slice(2)}`;
}

function defaultDescription(kind: TransactionKind): string {
  if (kind === "income") return "Receita";
  if (kind === "transfer") return "Transferência";
  return "Despesa";
}
