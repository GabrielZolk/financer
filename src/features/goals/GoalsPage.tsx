import { useEffect, useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { useTranslation } from "react-i18next";
import { Plus, Target, Trash2, PiggyBank, Check, Pencil } from "lucide-react";
import { db } from "@/db/schema";
import { create, update, softDelete } from "@/db/repo";
import { useAccounts, useAllTransactions } from "@/db/hooks";
import { balancesByAccount } from "@/lib/calc";
import { goalPotes, goalSaved } from "@/lib/calc/goals";
import { formatMoney, parseMoney } from "@/lib/money";
import { formatDate } from "@/lib/format";
import { confirmDelete } from "@/lib/utils";
import {
  Button,
  Card,
  EmptyState,
  Input,
  Label,
} from "@/components/ui/primitives";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { AccountSelect } from "@/features/accounts/AccountSelect";
import { PageHeader } from "@/components/PageHeader";
import { celebrate } from "@/components/feedback/Feito";
import type { Account, Goal, Transaction } from "@/db/types";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function GoalsPage() {
  const { t } = useTranslation();
  const goals = useLiveQuery(
    async () => (await db.goals.toArray()).filter((g) => g.deleted === 0),
    [],
    [],
  );
  const accounts = useAccounts(true);
  const transactions = useAllTransactions();
  const balances = useMemo(
    () => balancesByAccount(accounts, transactions),
    [accounts, transactions],
  );
  const accountMap = useMemo(
    () => new Map(accounts.map((a) => [a.id, a])),
    [accounts],
  );

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Goal | undefined>();
  const [aporteGoal, setAporteGoal] = useState<Goal | undefined>();

  return (
    <div>
      <PageHeader
        title={t("goals.title")}
        action={
          <Button
            onClick={() => {
              setEditing(undefined);
              setFormOpen(true);
            }}
          >
            <Plus size={18} /> {t("goals.new")}
          </Button>
        }
      />

      {goals.length === 0 ? (
        <EmptyState
          icon={<Target size={28} />}
          title={t("goals.emptyTitle")}
          description={t("goals.emptyDesc")}
          action={
            <Button
              onClick={() => {
                setEditing(undefined);
                setFormOpen(true);
              }}
            >
              <Plus size={18} /> {t("goals.newGoal")}
            </Button>
          }
        />
      ) : (
        <div className="space-y-3">
          {goals.map((goal, i) => {
            const saved = goalSaved(goal, balances);
            const ratio = goal.targetCents > 0 ? saved / goal.targetCents : 0;
            const done = saved >= goal.targetCents;
            const contribs = transactions
              .filter((tx) => tx.goalId === goal.id && tx.deleted === 0)
              .sort((a, b) => b.date.localeCompare(a.date))
              .slice(0, 3);
            return (
              <Card
                key={goal.id}
                className="anim-in cursor-pointer"
                style={{ animationDelay: `${Math.min(i * 60, 300)}ms` }}
                onClick={() => setAporteGoal(goal)}
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium">
                    {goal.name}
                    {done && (
                      <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-income/15 px-2 py-0.5 text-[10px] font-semibold text-income">
                        <Check size={11} /> {t("goals.done")}
                      </span>
                    )}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm tabular text-muted">
                      {Math.round(ratio * 100)}%
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditing(goal);
                        setFormOpen(true);
                      }}
                      className="rounded-lg p-1 text-muted transition-colors hover:bg-surface-2 hover:text-text"
                      aria-label={t("goals.editGoalAria")}
                    >
                      <Pencil size={15} />
                    </button>
                  </div>
                </div>
                <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-surface-2">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${Math.min(Math.max(ratio, 0) * 100, 100)}%`,
                      backgroundColor: done ? "var(--income)" : goal.color,
                    }}
                  />
                </div>
                <div className="mt-1.5 flex justify-between text-sm">
                  <span className="tabular">{formatMoney(saved)}</span>
                  <span className="tabular text-muted">
                    {t("goals.ofTarget", {
                      value: formatMoney(goal.targetCents),
                    })}
                  </span>
                </div>
                {contribs.length > 0 && (
                  <div className="mt-3 border-t border-border pt-2">
                    <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted">
                      {t("goals.contributions")}
                    </p>
                    {contribs.map((c) => (
                      <div key={c.id} className="flex justify-between text-xs">
                        <span className="truncate text-muted">
                          {formatDate(c.date)} ·{" "}
                          {t("goals.contribFrom", {
                            name: accountMap.get(c.accountId)?.name ?? "—",
                          })}
                        </span>
                        <span className="tabular text-income">
                          +{formatMoney(c.amountCents)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                <div className="mt-3 flex items-center justify-between gap-2">
                  <div className="min-w-0 text-xs text-muted">
                    {goal.deadline ? (
                      <span>
                        {t("goals.untilDate", {
                          date: formatDate(goal.deadline),
                        })}
                      </span>
                    ) : (
                      <span>{t("goals.trackOnly")}</span>
                    )}
                  </div>
                  <Button
                    size="sm"
                    variant={done ? "outline" : "primary"}
                    onClick={(e) => {
                      e.stopPropagation();
                      setAporteGoal(goal);
                    }}
                  >
                    <PiggyBank size={15} /> {t("goals.save")}
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <GoalForm open={formOpen} onOpenChange={setFormOpen} editing={editing} />
      <AporteDialog
        goal={aporteGoal}
        saved={aporteGoal ? goalSaved(aporteGoal, balances) : 0}
        onClose={() => setAporteGoal(undefined)}
      />
    </div>
  );
}

/* ------------------------------ Aporte (guardar) -------------------------- */
function AporteDialog({
  goal,
  saved,
  onClose,
}: {
  goal?: Goal;
  saved: number;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const accounts = useAccounts(true);
  const [amount, setAmount] = useState("");
  const [fromAccount, setFromAccount] = useState("");
  const [justNote, setJustNote] = useState(false);
  const [error, setError] = useState("");

  const sources = accounts.filter((a) => a.type !== "credit_card");

  useEffect(() => {
    if (!goal) return;
    setAmount("");
    setError("");
    setJustNote(false);
    setFromAccount(sources[0]?.id ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [goal]);

  if (!goal) return null;

  // garante um cofrinho (conta poupança) pra meta — criado só quando o usuário
  // move dinheiro de verdade. Reaproveita conta já vinculada, se houver.
  async function ensureCofrinho(): Promise<string> {
    const potes = goalPotes(goal!);
    if (potes.length) return potes[0];
    const created = await create<Account>("accounts", {
      name: t("goals.cofrinhoName", { name: goal!.name }),
      type: "savings",
      currency: "BRL",
      initialBalanceCents: 0,
      color: goal!.color,
      icon: "piggy-bank",
      archived: 0,
      order: Date.now(),
    });
    await update<Goal>("goals", goal!.id, { accountIds: [created.id] });
    return created.id;
  }

  async function handleSubmit() {
    const cents = parseMoney(amount);
    if (!cents || cents <= 0) {
      setError(t("goals.errAmount"));
      return;
    }

    if (justNote) {
      // só anotar: sobe o número, sem mexer nas contas
      await update<Goal>("goals", goal!.id, {
        savedCents: goal!.savedCents + cents,
      });
    } else {
      if (!fromAccount) {
        setError(t("goals.errFrom"));
        return;
      }
      const cofre = await ensureCofrinho();
      if (fromAccount === cofre) {
        setError(t("goals.errFromDiff"));
        return;
      }
      const acc = accounts.find((a) => a.id === fromAccount);
      await create<Transaction>("transactions", {
        accountId: fromAccount,
        toAccountId: cofre,
        categoryId: null,
        kind: "transfer",
        amountCents: cents,
        currency: acc?.currency ?? "BRL",
        date: today(),
        description: t("goals.aporteDesc", { name: goal!.name }),
        tags: ["meta"],
        status: "cleared",
        goalId: goal!.id,
      });
    }

    const reached =
      saved < goal!.targetCents && saved + cents >= goal!.targetCents;
    onClose();
    celebrate(
      reached ? "confetti" : "coin",
      reached
        ? t("goals.reached")
        : t("goals.saved", { value: formatMoney(cents) }),
    );
  }

  return (
    <Dialog open={!!goal} onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={t("goals.aporteTitle", { name: goal.name })}>
        <div className="space-y-4">
          <div>
            <Label>{t("goals.amount")}</Label>
            <Input
              inputMode="decimal"
              placeholder="0,00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="text-lg font-semibold tabular"
              autoFocus
            />
          </div>

          {!justNote && (
            <div>
              <Label>{t("goals.fromAccount")}</Label>
              <AccountSelect
                value={fromAccount}
                onChange={setFromAccount}
                accounts={sources}
              />
            </div>
          )}

          <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-border p-3">
            <input
              type="checkbox"
              checked={justNote}
              onChange={(e) => setJustNote(e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-primary"
            />
            <span>
              <span className="text-sm font-medium">{t("goals.justNote")}</span>
              <span className="block text-xs text-muted">
                {t("goals.justNoteHint")}
              </span>
            </span>
          </label>

          {error && <p className="text-sm text-expense">{error}</p>}

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={onClose}>
              {t("common.cancel")}
            </Button>
            <Button onClick={handleSubmit}>{t("goals.save")}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

const COLORS = ["#6366f1", "#16a34a", "#f59e0b", "#ec4899", "#0ea5e9"];

function GoalForm({
  open,
  onOpenChange,
  editing,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  editing?: Goal;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [target, setTarget] = useState("");
  const [saved, setSaved] = useState("");
  const [deadline, setDeadline] = useState("");
  const [color, setColor] = useState(COLORS[0]);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setName(editing.name);
      setTarget((editing.targetCents / 100).toString().replace(".", ","));
      setSaved((editing.savedCents / 100).toString().replace(".", ","));
      setDeadline(editing.deadline ?? "");
      setColor(editing.color);
    } else {
      setName("");
      setTarget("");
      setSaved("");
      setDeadline("");
      setColor(COLORS[0]);
    }
    setError("");
  }, [open, editing]);

  async function handleSubmit() {
    const targetCents = parseMoney(target);
    if (!name.trim() || !targetCents || targetCents <= 0) {
      setError(t("goals.errNameTarget"));
      return;
    }
    const data = {
      name: name.trim(),
      targetCents,
      savedCents: parseMoney(saved) ?? 0,
      deadline: deadline || null,
      accountId: null,
      // preserva o cofrinho já vinculado ao editar; novas metas começam sem
      accountIds: editing ? goalPotes(editing) : [],
      color,
      archived: 0 as const,
    };
    if (editing) await update<Goal>("goals", editing.id, data);
    else await create<Goal>("goals", data);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={editing ? t("goals.formEditTitle") : t("goals.formNewTitle")}
      >
        <div className="space-y-4">
          <div>
            <Label>{t("goals.name")}</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("goals.namePlaceholder")}
              autoFocus
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>{t("goals.target")}</Label>
              <Input
                inputMode="decimal"
                placeholder="0,00"
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                className="tabular"
              />
            </div>
            <div>
              <Label>{t("goals.deadline")}</Label>
              <Input
                type="date"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
              />
            </div>
          </div>

          {/* Já guardado (opcional) — o quanto você já tem reservado hoje */}
          <div>
            <Label>{t("goals.alreadySaved")}</Label>
            <Input
              inputMode="decimal"
              placeholder="0,00"
              value={saved}
              onChange={(e) => setSaved(e.target.value)}
              className="tabular"
            />
            <p className="mt-1.5 text-xs text-muted">
              {t("goals.alreadySavedHint")}
            </p>
          </div>

          <div>
            <Label>{t("goals.color")}</Label>
            <div className="flex gap-2">
              {COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  className="h-8 w-8 rounded-full border-2"
                  style={{
                    backgroundColor: c,
                    borderColor: color === c ? "var(--text)" : "transparent",
                  }}
                />
              ))}
            </div>
          </div>

          {error && <p className="text-sm text-expense">{error}</p>}

          <div className="flex items-center justify-between gap-2 pt-2">
            {editing ? (
              <Button
                variant="ghost"
                size="icon"
                onClick={async () => {
                  if (!confirmDelete(t("goals.confirmDelete"))) return;
                  await softDelete("goals", editing.id);
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
      </DialogContent>
    </Dialog>
  );
}
