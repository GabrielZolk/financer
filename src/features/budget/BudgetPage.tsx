import { useEffect, useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { ChevronLeft, ChevronRight, Plus, Trash2, PiggyBank } from "lucide-react";
import { db } from "@/db/schema";
import { create, update, softDelete } from "@/db/repo";
import { useCategories, useAllTransactions } from "@/db/hooks";
import { budgetStatus, resolveBudgets } from "@/lib/calc";
import { formatMoney, parseMoney } from "@/lib/money";
import { currentMonth, confirmDelete } from "@/lib/utils";
import {
  Button,
  Card,
  EmptyState,
  Input,
  Label,
  Select,
} from "@/components/ui/primitives";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { CategoryIcon } from "@/components/ui/CategoryIcon";
import { CategoryForm } from "@/features/categories/CategoryForm";
import { PageHeader } from "@/components/PageHeader";
import type { Budget, Category } from "@/db/types";

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function BudgetPage() {
  const [month, setMonth] = useState(currentMonth());
  const categories = useCategories("expense");
  const transactions = useAllTransactions();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Budget | undefined>();

  const allBudgets = useLiveQuery(
    async () => (await db.budgets.toArray()).filter((b) => b.deleted === 0),
    [],
    [],
  );
  // orçamentos efetivos do mês = explícitos do mês + recorrentes vigentes
  const budgets = useMemo(
    () => resolveBudgets(allBudgets, month),
    [allBudgets, month],
  );

  const categoryMap = useMemo(
    () => new Map(categories.map((c) => [c.id, c])),
    [categories],
  );
  const budgetedIds = useMemo(
    () => new Set(budgets.map((b) => b.categoryId)),
    [budgets],
  );

  const totalLimit = budgets.reduce((s, b) => s + b.limitCents, 0);
  const totalSpent = budgets.reduce(
    (s, b) => s + budgetStatus(b, transactions).spentCents,
    0,
  );
  const monthLabel = new Date(month + "-01T00:00:00").toLocaleDateString(
    "pt-BR",
    { month: "long", year: "numeric" },
  );

  return (
    <div>
      <PageHeader
        title="Orçamento"
        action={
          <Button
            onClick={() => {
              setEditing(undefined);
              setFormOpen(true);
            }}
          >
            <Plus size={18} /> Novo
          </Button>
        }
      />

      {/* Navegação de mês */}
      <div className="mb-4 flex items-center justify-between rounded-xl border border-border bg-surface px-2 py-1.5">
        <button
          onClick={() => setMonth(shiftMonth(month, -1))}
          className="rounded-lg p-1.5 hover:bg-surface-2"
        >
          <ChevronLeft size={18} />
        </button>
        <span className="text-sm font-medium capitalize">{monthLabel}</span>
        <button
          onClick={() => setMonth(shiftMonth(month, 1))}
          className="rounded-lg p-1.5 hover:bg-surface-2"
        >
          <ChevronRight size={18} />
        </button>
      </div>

      {totalLimit > 0 && (
        <Card className="mb-4">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted">Gasto no mês</span>
            <span className="tabular font-semibold">
              {formatMoney(totalSpent)} / {formatMoney(totalLimit)}
            </span>
          </div>
          <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-surface-2">
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${Math.min((totalSpent / totalLimit) * 100, 100)}%`,
                backgroundColor:
                  totalSpent > totalLimit ? "var(--expense)" : "var(--primary)",
              }}
            />
          </div>
        </Card>
      )}

      {budgets.length === 0 ? (
        <EmptyState
          icon={<PiggyBank size={28} />}
          title="Nenhum orçamento"
          description="Escolha categorias e defina um limite mensal pra cada uma."
          action={
            <Button
              onClick={() => {
                setEditing(undefined);
                setFormOpen(true);
              }}
            >
              <Plus size={18} /> Adicionar orçamento
            </Button>
          }
        />
      ) : (
        <div className="space-y-2">
          {budgets.map((b) => {
            const cat = categoryMap.get(b.categoryId);
            const status = budgetStatus(b, transactions);
            return (
              <Card
                key={b.id}
                className="cursor-pointer py-3"
                onClick={() => {
                  setEditing(b);
                  setFormOpen(true);
                }}
              >
                <div className="flex items-center gap-3">
                  <CategoryIcon
                    icon={cat?.icon}
                    color={cat?.color ?? "#94a3b8"}
                    size={34}
                  />
                  <span className="flex flex-1 items-center gap-1.5 text-sm font-medium">
                    {cat?.name ?? "Categoria"}
                    {b.recurring === 1 && (
                      <span className="rounded-full bg-surface-2 px-1.5 py-0.5 text-[10px] font-semibold text-muted">
                        todo mês
                      </span>
                    )}
                  </span>
                  <span className="tabular text-sm font-semibold">
                    {formatMoney(status.limitCents)}
                  </span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-2">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${Math.min(status.ratio * 100, 100)}%`,
                      backgroundColor: status.overBudget
                        ? "var(--expense)"
                        : (cat?.color ?? "var(--primary)"),
                    }}
                  />
                </div>
                <div className="mt-1 flex justify-between text-xs">
                  <span className="text-muted">
                    {formatMoney(status.spentCents)} gasto
                  </span>
                  <span className={status.overBudget ? "text-expense" : "text-muted"}>
                    {status.overBudget ? "estourou " : "resta "}
                    {formatMoney(Math.abs(status.remainingCents))}
                  </span>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <BudgetForm
        open={formOpen}
        onOpenChange={setFormOpen}
        editing={editing}
        month={month}
        categories={categories}
        budgetedIds={budgetedIds}
        categoryMap={categoryMap}
      />
    </div>
  );
}

function BudgetForm({
  open,
  onOpenChange,
  editing,
  month,
  categories,
  budgetedIds,
  categoryMap,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  editing?: Budget;
  month: string;
  categories: Category[];
  budgetedIds: Set<string>;
  categoryMap: Map<string, Category>;
}) {
  const [categoryId, setCategoryId] = useState("");
  const [limit, setLimit] = useState("");
  const [recurring, setRecurring] = useState(true);
  const [error, setError] = useState("");
  const [catFormOpen, setCatFormOpen] = useState(false);

  // categorias disponíveis para um NOVO orçamento (ainda sem orçamento no mês)
  const available = categories.filter((c) => !budgetedIds.has(c.id));

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
      setCategoryId(editing.categoryId);
      setLimit((editing.limitCents / 100).toString().replace(".", ","));
      setRecurring(editing.recurring === 1);
    } else {
      setCategoryId(available[0]?.id ?? "");
      setLimit("");
      setRecurring(true);
    }
    setError("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing]);

  async function handleSubmit() {
    const cents = parseMoney(limit);
    if (!categoryId) {
      setError("Escolha uma categoria.");
      return;
    }
    if (!cents || cents <= 0) {
      setError("Informe um limite válido.");
      return;
    }
    const rec = (recurring ? 1 : 0) as 0 | 1;
    if (editing) {
      await update<Budget>("budgets", editing.id, {
        limitCents: cents,
        recurring: rec,
      });
    } else {
      await create<Budget>("budgets", {
        categoryId,
        month,
        limitCents: cents,
        recurring: rec,
      });
    }
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={editing ? "Editar orçamento" : "Novo orçamento"}>
        <div className="space-y-4">
          {editing ? (
            <div className="flex items-center gap-3">
              <CategoryIcon
                icon={categoryMap.get(editing.categoryId)?.icon}
                color={categoryMap.get(editing.categoryId)?.color ?? "#94a3b8"}
                size={40}
              />
              <span className="font-medium">
                {categoryMap.get(editing.categoryId)?.name ?? "Categoria"}
              </span>
            </div>
          ) : (
            <div>
              <Label>Categoria</Label>
              <Select value={categoryId} onChange={(e) => onPickCategory(e.target.value)}>
                {available.length === 0 && (
                  <option value="" disabled>
                    Todas já têm orçamento — crie uma nova
                  </option>
                )}
                {available.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
                <option value="__new__">+ Nova categoria…</option>
              </Select>
            </div>
          )}

          <div>
            <Label>Limite mensal</Label>
            <Input
              inputMode="decimal"
              placeholder="0,00"
              value={limit}
              onChange={(e) => setLimit(e.target.value)}
              className="tabular"
              autoFocus
            />
          </div>

          <label className="flex items-center gap-2 text-sm text-muted">
            <input
              type="checkbox"
              checked={recurring}
              onChange={(e) => setRecurring(e.target.checked)}
              className="h-4 w-4 rounded border-border"
            />
            Repetir todo mês (vale pros próximos meses automaticamente)
          </label>

          {error && <p className="text-sm text-expense">{error}</p>}

          <div className="flex items-center justify-between gap-2 pt-1">
            {editing ? (
              <Button
                variant="ghost"
                size="icon"
                onClick={async () => {
                  if (!confirmDelete("este orçamento")) return;
                  await softDelete("budgets", editing.id);
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
              <Button onClick={handleSubmit} disabled={!editing && !categoryId}>
                Salvar
              </Button>
            </div>
          </div>
        </div>

        {/* criação inline de categoria a partir do seletor */}
        <CategoryForm
          open={catFormOpen}
          onOpenChange={setCatFormOpen}
          defaultKind="expense"
          onCreated={(cat) => setCategoryId(cat.id)}
        />
      </DialogContent>
    </Dialog>
  );
}
