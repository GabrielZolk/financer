import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { useTranslation } from "react-i18next";
import { Plus, Repeat, Trash2, ArrowLeft, Pause, Play } from "lucide-react";
import { Link } from "react-router-dom";
import { db } from "@/db/schema";
import { create, update, softDelete } from "@/db/repo";
import { useAccounts, useCategories } from "@/db/hooks";
import { formatMoney, parseMoney } from "@/lib/money";
import { formatDate } from "@/lib/format";
import { confirmDelete, cn } from "@/lib/utils";
import {
  Button,
  Card,
  EmptyState,
  Input,
  Label,
  Select,
} from "@/components/ui/primitives";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { CategoryForm } from "@/features/categories/CategoryForm";
import { AccountSelect } from "@/features/accounts/AccountSelect";
import { PageHeader } from "@/components/PageHeader";
import type { Recurrence, RecurrenceFrequency, TransactionKind } from "@/db/types";

const FREQ_KEY: Record<RecurrenceFrequency, string> = {
  daily: "rec.freqDaily",
  weekly: "rec.freqWeekly",
  biweekly: "rec.freqBiweekly",
  monthly: "rec.freqMonthly",
  yearly: "rec.freqYearly",
};

export function RecurrencesPage() {
  const { t } = useTranslation();
  const recurrences = useLiveQuery(
    async () =>
      (await db.recurrences.toArray())
        .filter((r) => r.deleted === 0)
        .sort((a, b) => a.nextDate.localeCompare(b.nextDate)),
    [],
    [],
  );
  const accounts = useAccounts(true);
  const accountMap = new Map(accounts.map((a) => [a.id, a]));

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Recurrence | undefined>();

  return (
    <div>
      <Link
        to="/settings"
        className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-text"
      >
        <ArrowLeft size={16} /> {t("cat.backSettings")}
      </Link>
      <PageHeader
        title={t("rec.title")}
        subtitle={t("rec.subtitle")}
        action={
          <Button
            onClick={() => {
              setEditing(undefined);
              setFormOpen(true);
            }}
          >
            <Plus size={18} /> {t("common.new")}
          </Button>
        }
      />

      {recurrences.length === 0 ? (
        <EmptyState
          icon={<Repeat size={28} />}
          title={t("rec.emptyTitle")}
          description={t("rec.emptyDesc")}
        />
      ) : (
        <div className="space-y-2">
          {recurrences.map((r) => {
            const acc = accountMap.get(r.accountId);
            const sign = r.kind === "income" ? "+" : r.kind === "expense" ? "-" : "";
            return (
              <Card
                key={r.id}
                className={cn(
                  "flex cursor-pointer items-center justify-between gap-2",
                  r.active === 0 && "opacity-60",
                )}
                onClick={() => {
                  setEditing(r);
                  setFormOpen(true);
                }}
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">
                    {r.description}
                    {r.active === 0 && (
                      <span className="ml-2 rounded-full bg-surface-2 px-2 py-0.5 align-middle text-[10px] font-semibold uppercase tracking-wide text-muted">
                        {t("rec.pausedBadge")}
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-muted">
                    {t(FREQ_KEY[r.frequency])} · {acc?.name ?? ""} ·{" "}
                    {t("rec.nextPrefix")}{" "}
                    {formatDate(r.nextDate, {
                      day: "2-digit",
                      month: "2-digit",
                      year: "2-digit",
                    })}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      void update<Recurrence>("recurrences", r.id, {
                        active: r.active === 1 ? 0 : 1,
                      });
                    }}
                    className="rounded-lg p-1.5 text-muted transition-colors hover:bg-surface-2 hover:text-text"
                    aria-label={r.active === 1 ? t("rec.pause") : t("rec.resume")}
                    title={r.active === 1 ? t("rec.pause") : t("rec.resume")}
                  >
                    {r.active === 1 ? <Pause size={16} /> : <Play size={16} />}
                  </button>
                  <span
                    className="font-semibold tabular"
                    style={{
                      color:
                        r.kind === "income"
                          ? "var(--income)"
                          : r.kind === "expense"
                            ? "var(--expense)"
                            : "var(--muted)",
                    }}
                  >
                    {sign}
                    {formatMoney(r.amountCents)}
                  </span>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <RecurrenceForm
        open={formOpen}
        onOpenChange={setFormOpen}
        editing={editing}
      />
    </div>
  );
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function RecurrenceForm({
  open,
  onOpenChange,
  editing,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  editing?: Recurrence;
}) {
  const { t } = useTranslation();
  const accounts = useAccounts();
  const [kind, setKind] = useState<TransactionKind>("expense");
  const categories = useCategories(kind === "transfer" ? undefined : kind);

  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [accountId, setAccountId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [frequency, setFrequency] = useState<RecurrenceFrequency>("monthly");
  const [nextDate, setNextDate] = useState(today());
  const [endDate, setEndDate] = useState("");
  const [error, setError] = useState("");
  const [catFormOpen, setCatFormOpen] = useState(false);

  function onPickCategory(value: string) {
    if (value === "__new__") {
      setCatFormOpen(true);
      return;
    }
    setCategoryId(value);
  }

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setKind(editing.kind);
      setDescription(editing.description);
      setAmount((editing.amountCents / 100).toString().replace(".", ","));
      setAccountId(editing.accountId);
      setCategoryId(editing.categoryId ?? "");
      setFrequency(editing.frequency);
      setNextDate(editing.nextDate);
      setEndDate(editing.endDate ?? "");
    } else {
      setKind("expense");
      setDescription("");
      setAmount("");
      setAccountId(accounts[0]?.id ?? "");
      setCategoryId("");
      setFrequency("monthly");
      setNextDate(today());
      setEndDate("");
    }
    setError("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing]);

  useEffect(() => {
    if (open && !accountId && accounts[0]) setAccountId(accounts[0].id);
  }, [open, accountId, accounts]);

  async function handleSubmit() {
    const cents = parseMoney(amount);
    if (!description.trim() || !cents || cents <= 0 || !accountId) {
      setError(t("rec.errFill"));
      return;
    }
    const data = {
      description: description.trim(),
      kind,
      amountCents: cents,
      accountId,
      toAccountId: null,
      categoryId: kind === "transfer" ? null : categoryId || null,
      frequency,
      nextDate,
      endDate: endDate || null,
      active: editing ? editing.active : (1 as const),
    };
    if (editing) await update<Recurrence>("recurrences", editing.id, data);
    else await create<Recurrence>("recurrences", data);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={editing ? t("rec.editTitle") : t("rec.newTitle")}>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-1 rounded-xl bg-surface-2 p-1">
            {(["expense", "income"] as const).map((k) => (
              <button
                key={k}
                onClick={() => setKind(k)}
                className={`rounded-lg py-2 text-sm font-medium ${
                  kind === k
                    ? k === "income"
                      ? "bg-surface text-income shadow-sm"
                      : "bg-surface text-expense shadow-sm"
                    : "text-muted"
                }`}
              >
                {k === "income" ? t("rec.kindIncome") : t("rec.kindExpense")}
              </button>
            ))}
          </div>

          <div>
            <Label>{t("rec.description")}</Label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t("rec.descPlaceholder")}
              autoFocus
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>{t("rec.amount")}</Label>
              <Input
                inputMode="decimal"
                placeholder="0,00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="tabular"
              />
            </div>
            <div>
              <Label>{t("rec.frequency")}</Label>
              <Select
                value={frequency}
                onChange={(e) =>
                  setFrequency(e.target.value as RecurrenceFrequency)
                }
              >
                {Object.entries(FREQ_KEY).map(([v, k]) => (
                  <option key={v} value={v}>
                    {t(k)}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>{t("rec.account")}</Label>
              <AccountSelect
                value={accountId}
                onChange={setAccountId}
                accounts={accounts}
              />
            </div>
            <div>
              <Label>{t("rec.category")}</Label>
              <Select value={categoryId} onChange={(e) => onPickCategory(e.target.value)}>
                <option value="">{t("rec.noCategory")}</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
                <option value="__new__">{t("rec.newCategory")}</option>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>{t("rec.nextEntry")}</Label>
              <Input
                type="date"
                value={nextDate}
                onChange={(e) => setNextDate(e.target.value)}
              />
            </div>
            <div>
              <Label>{t("rec.endOptional")}</Label>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          </div>

          {error && <p className="text-sm text-expense">{error}</p>}

          <div className="flex items-center justify-between gap-2 pt-2">
            {editing ? (
              <Button
                variant="ghost"
                size="icon"
                onClick={async () => {
                  if (!confirmDelete(t("rec.confirmDelete"))) return;
                  await softDelete("recurrences", editing.id);
                  onOpenChange(false);
                }}
              >
                <Trash2 size={18} className="text-expense" />
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                {t("common.cancel")}
              </Button>
              <Button onClick={handleSubmit}>{t("common.save")}</Button>
            </div>
          </div>
        </div>

        {/* criação inline de categoria a partir do seletor */}
        <CategoryForm
          open={catFormOpen}
          onOpenChange={setCatFormOpen}
          defaultKind={kind === "transfer" ? "expense" : kind}
          onCreated={(cat) => setCategoryId(cat.id)}
        />
      </DialogContent>
    </Dialog>
  );
}
