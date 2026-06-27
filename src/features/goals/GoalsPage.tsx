import { useEffect, useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Plus, Target, Trash2, PiggyBank, Check, Pencil, X } from "lucide-react";
import { db } from "@/db/schema";
import { create, update, softDelete } from "@/db/repo";
import { useAccounts, useAllTransactions } from "@/db/hooks";
import { balancesByAccount } from "@/lib/calc";
import { goalPotes, goalSaved } from "@/lib/calc/goals";
import { formatMoney, parseMoney } from "@/lib/money";
import { confirmDelete } from "@/lib/utils";
import {
  Button,
  Card,
  EmptyState,
  Input,
  Label,
} from "@/components/ui/primitives";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { AccountForm } from "@/features/accounts/AccountForm";
import { AccountSelect } from "@/features/accounts/AccountSelect";
import { PageHeader } from "@/components/PageHeader";
import { celebrate } from "@/components/feedback/Feito";
import type { Account, Goal, Transaction } from "@/db/types";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function GoalsPage() {
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
        title="Metas"
        action={
          <Button
            onClick={() => {
              setEditing(undefined);
              setFormOpen(true);
            }}
          >
            <Plus size={18} /> Nova
          </Button>
        }
      />

      {goals.length === 0 ? (
        <EmptyState
          icon={<Target size={28} />}
          title="Nenhuma meta"
          description="Crie metas de poupança com valor-alvo e prazo."
          action={
            <Button
              onClick={() => {
                setEditing(undefined);
                setFormOpen(true);
              }}
            >
              <Plus size={18} /> Nova meta
            </Button>
          }
        />
      ) : (
        <div className="space-y-3">
          {goals.map((goal, i) => {
            const saved = goalSaved(goal, balances);
            const ratio = goal.targetCents > 0 ? saved / goal.targetCents : 0;
            const done = saved >= goal.targetCents;
            const potes = goalPotes(goal)
              .map((id) => accountMap.get(id)?.name)
              .filter(Boolean) as string[];
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
                        <Check size={11} /> concluída
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
                      aria-label="Editar meta"
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
                    de {formatMoney(goal.targetCents)}
                  </span>
                </div>
                <div className="mt-3 flex items-center justify-between gap-2">
                  <div className="min-w-0 text-xs text-muted">
                    {potes.length > 0 ? (
                      <span className="truncate">
                        🐷 {potes.join(" + ")}
                      </span>
                    ) : goal.deadline ? (
                      <span>
                        até{" "}
                        {new Date(
                          goal.deadline + "T00:00:00",
                        ).toLocaleDateString("pt-BR")}
                      </span>
                    ) : (
                      <span>só acompanha o progresso</span>
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
                    <PiggyBank size={15} /> Guardar
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
  const accounts = useAccounts(true);
  const [amount, setAmount] = useState("");
  const [fromAccount, setFromAccount] = useState("");
  const [toPote, setToPote] = useState("");
  const [error, setError] = useState("");

  const potes = useMemo(() => (goal ? goalPotes(goal) : []), [goal]);

  useEffect(() => {
    if (!goal) return;
    setAmount("");
    setError("");
    const firstPote = potes[0] ?? "";
    setToPote(firstPote);
    // origem padrão: 1ª conta que NÃO é pote (sua conta do dia a dia)
    const src =
      accounts.find((a) => !potes.includes(a.id)) ??
      accounts.find((a) => a.id !== firstPote);
    setFromAccount(src?.id ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [goal]);

  if (!goal) return null;

  const hasPotes = potes.length > 0;
  const poteAccounts = potes
    .map((id) => accounts.find((a) => a.id === id))
    .filter(Boolean) as Account[];

  async function handleSubmit() {
    const cents = parseMoney(amount);
    if (!cents || cents <= 0) {
      setError("Informe um valor válido.");
      return;
    }

    if (hasPotes) {
      if (!toPote) {
        setError("Escolha em qual pote guardar.");
        return;
      }
      if (!fromAccount || fromAccount === toPote) {
        setError("Escolha uma conta de origem diferente do pote.");
        return;
      }
      const acc = accounts.find((a) => a.id === fromAccount);
      await create<Transaction>("transactions", {
        accountId: fromAccount,
        toAccountId: toPote,
        categoryId: null,
        kind: "transfer",
        amountCents: cents,
        currency: acc?.currency ?? "BRL",
        date: today(),
        description: `Aporte: ${goal!.name}`,
        tags: ["meta"],
        status: "cleared",
        goalId: goal!.id,
      });
      // progresso é calculado pela soma dos potes — não mexe em savedCents
    } else {
      // modo "só acompanhar": ajusta o número manual
      await update<Goal>("goals", goal!.id, { savedCents: saved + cents });
    }

    const reached = saved < goal!.targetCents && saved + cents >= goal!.targetCents;
    onClose();
    celebrate(
      reached ? "confetti" : "coin",
      reached ? "Meta atingida! 🎉" : `Guardado ${formatMoney(cents)}`,
    );
  }

  return (
    <Dialog open={!!goal} onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={`Guardar em "${goal.name}"`}>
        <div className="space-y-4">
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
          </div>

          {hasPotes ? (
            <>
              <div>
                <Label>Tirar de qual conta</Label>
                <AccountSelect
                  value={fromAccount}
                  onChange={setFromAccount}
                  accounts={accounts}
                  exclude={toPote || undefined}
                />
              </div>
              {poteAccounts.length > 1 ? (
                <div>
                  <Label>Guardar em qual pote</Label>
                  <AccountSelect
                    value={toPote}
                    onChange={setToPote}
                    accounts={poteAccounts}
                    defaultType="savings"
                  />
                </div>
              ) : (
                <p className="text-xs text-muted">
                  Vai para <b>{poteAccounts[0]?.name ?? "o pote"}</b> (transferência,
                  não conta como gasto).
                </p>
              )}
            </>
          ) : (
            <p className="text-xs text-muted">
              Esta meta só acompanha o progresso — o dinheiro fica onde está. Para
              mover de verdade, vincule um cofrinho ao editar a meta.
            </p>
          )}

          {error && <p className="text-sm text-expense">{error}</p>}

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button onClick={handleSubmit}>Guardar</Button>
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
  const accounts = useAccounts(true);
  const [name, setName] = useState("");
  const [target, setTarget] = useState("");
  const [saved, setSaved] = useState("");
  const [deadline, setDeadline] = useState("");
  const [potes, setPotes] = useState<string[]>([]);
  const [color, setColor] = useState(COLORS[0]);
  const [error, setError] = useState("");
  const [acctFormOpen, setAcctFormOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setName(editing.name);
      setTarget((editing.targetCents / 100).toString().replace(".", ","));
      setSaved((editing.savedCents / 100).toString().replace(".", ","));
      setDeadline(editing.deadline ?? "");
      setPotes(goalPotes(editing));
      setColor(editing.color);
    } else {
      setName("");
      setTarget("");
      setSaved("");
      setDeadline("");
      setPotes([]);
      setColor(COLORS[0]);
    }
    setError("");
  }, [open, editing]);

  function togglePote(id: string) {
    setPotes((arr) =>
      arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id],
    );
  }

  const hasPotes = potes.length > 0;
  const trapPote = accounts.find(
    (a) => potes.includes(a.id) && (a.type === "checking" || a.type === "cash"),
  );

  async function handleSubmit() {
    const targetCents = parseMoney(target);
    if (!name.trim() || !targetCents || targetCents <= 0) {
      setError("Informe nome e valor-alvo.");
      return;
    }
    const data = {
      name: name.trim(),
      targetCents,
      // com potes o progresso é calculado; o número manual só vale sem potes
      savedCents: hasPotes ? 0 : (parseMoney(saved) ?? 0),
      deadline: deadline || null,
      accountId: null,
      accountIds: potes,
      color,
      archived: 0 as const,
    };
    if (editing) await update<Goal>("goals", editing.id, data);
    else await create<Goal>("goals", data);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={editing ? "Editar meta" : "Nova meta"}>
        <div className="space-y-4">
          <div>
            <Label>Nome</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex.: Reserva de emergência"
              autoFocus
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Valor-alvo</Label>
              <Input
                inputMode="decimal"
                placeholder="0,00"
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                className="tabular"
              />
            </div>
            <div>
              <Label>Prazo (opcional)</Label>
              <Input
                type="date"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
              />
            </div>
          </div>

          {/* Potes da meta (onde o dinheiro fica) */}
          <div>
            <Label>Potes da meta (opcional)</Label>
            <div className="flex flex-wrap gap-1.5">
              {accounts.map((a) => {
                const on = potes.includes(a.id);
                return (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => togglePote(a.id)}
                    className={
                      "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors " +
                      (on
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border text-muted hover:text-text")
                    }
                  >
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ background: a.color }}
                    />
                    {a.name}
                    {on && <X size={12} />}
                  </button>
                );
              })}
              <button
                type="button"
                onClick={() => setAcctFormOpen(true)}
                className="rounded-full border border-dashed border-border px-3 py-1.5 text-xs font-medium text-primary hover:bg-surface-2"
              >
                ＋ Nova conta
              </button>
            </div>
            <p className="mt-1.5 text-xs text-muted">
              {hasPotes ? (
                <>
                  O guardado vira a <b>soma dos saldos</b> destes potes
                  (atualiza sozinho). Pode juntar vários — ex.: cofrinho +
                  limite garantido.
                </>
              ) : (
                <>
                  Sem pote: a meta <b>só acompanha</b> o progresso (o dinheiro
                  fica onde está). Vincule um cofrinho só se quiser mover o
                  dinheiro pra fora da conta.
                </>
              )}
            </p>
            {trapPote && (
              <p className="mt-1.5 rounded-lg border border-amber-500/40 bg-amber-500/10 px-2.5 py-2 text-xs text-amber-300">
                ⚠️ <b>{trapPote.name}</b> é uma conta do dia a dia. Usá-la como
                pote faz o guardado seguir o saldo dela toda — geralmente você
                quer um <b>cofrinho/poupança separado</b>.
              </p>
            )}
          </div>

          {/* Já guardado: só no modo "sem pote" (número manual) */}
          {!hasPotes && (
            <div>
              <Label>Já guardado</Label>
              <Input
                inputMode="decimal"
                placeholder="0,00"
                value={saved}
                onChange={(e) => setSaved(e.target.value)}
                className="tabular"
              />
            </div>
          )}

          <div>
            <Label>Cor</Label>
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
                  if (!confirmDelete("esta meta")) return;
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
                Cancelar
              </Button>
              <Button onClick={handleSubmit}>Salvar</Button>
            </div>
          </div>
        </div>

        {/* criar um pote (conta) na hora */}
        <AccountForm
          open={acctFormOpen}
          onOpenChange={setAcctFormOpen}
          defaultType="savings"
          onCreated={(acc) => setPotes((arr) => [...arr, acc.id])}
        />
      </DialogContent>
    </Dialog>
  );
}
