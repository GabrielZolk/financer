import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Plus, Search } from "lucide-react";
import {
  useAccounts,
  useCategories,
  useTransactions,
  useAllTransactions,
  type TransactionFilter,
} from "@/db/hooks";
import { Button, Card, EmptyState, Input, Select } from "@/components/ui/primitives";
import { PageHeader } from "@/components/PageHeader";
import { TransactionItem } from "./TransactionItem";
import { TransactionForm } from "./TransactionForm";
import type { Transaction } from "@/db/types";
import { formatMoney } from "@/lib/money";

export function TransactionsPage() {
  const accounts = useAccounts(true);
  const categoriesArr = useCategories();
  const [params] = useSearchParams();
  const [search, setSearch] = useState("");
  const [accountId, setAccountId] = useState("");
  const [kind, setKind] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [onlyReimb, setOnlyReimb] = useState(false);
  // tag inicial pode vir da URL (ex.: vindo do gerenciador de Tags)
  const [tag, setTag] = useState(params.get("tag") ?? "");

  const filter: TransactionFilter = {
    search: search || undefined,
    accountId: accountId || undefined,
    kind: (kind as Transaction["kind"]) || undefined,
    from: from || undefined,
    to: to || undefined,
  };
  const allMatching = useTransactions(filter);

  // universo de tags (das transações que batem com os outros filtros)
  const tags = useMemo(() => {
    const set = new Set<string>();
    for (const t of allMatching) {
      t.tags.forEach((x) => set.add(x));
      t.splits?.forEach((s) => s.tags?.forEach((x) => set.add(x)));
    }
    return [...set].sort();
  }, [allMatching]);

  const transactions = useMemo(() => {
    let list = tag
      ? allMatching.filter(
          (t) =>
            t.tags.includes(tag) ||
            t.splits?.some((s) => s.tags?.includes(tag)),
        )
      : allMatching;
    if (onlyReimb)
      list = list.filter((t) => t.reimbursable === 1 && t.reimbursed !== 1);
    return list;
  }, [allMatching, tag, onlyReimb]);

  // reembolsos pendentes (a receber) — global, independente dos filtros
  const allTx = useAllTransactions();
  const pendingReimb = useMemo(
    () => allTx.filter((t) => t.reimbursable === 1 && t.reimbursed !== 1),
    [allTx],
  );
  const pendingReimbTotal = pendingReimb.reduce((s, t) => s + t.amountCents, 0);

  const accountMap = useMemo(
    () => new Map(accounts.map((a) => [a.id, a])),
    [accounts],
  );
  const categoryMap = useMemo(
    () => new Map(categoriesArr.map((c) => [c.id, c])),
    [categoriesArr],
  );

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Transaction | undefined>();
  const [duplicateFrom, setDuplicateFrom] = useState<Transaction | undefined>();

  const grouped = useMemo(() => groupByDate(transactions), [transactions]);

  function openNew() {
    setEditing(undefined);
    setDuplicateFrom(undefined);
    setFormOpen(true);
  }
  function openEdit(tx: Transaction) {
    setDuplicateFrom(undefined);
    setEditing(tx);
    setFormOpen(true);
  }
  function duplicate(tx: Transaction) {
    // reabre o form como NOVO, prefilado a partir do lançamento original
    setEditing(undefined);
    setDuplicateFrom(tx);
    setFormOpen(true);
  }

  return (
    <div>
      <PageHeader
        title="Lançamentos"
        action={
          <Button onClick={openNew}>
            <Plus size={18} /> Novo
          </Button>
        }
      />

      {/* Reembolsos pendentes (a receber) */}
      {pendingReimb.length > 0 && (
        <button
          onClick={() => setOnlyReimb((v) => !v)}
          className={
            "mb-3 flex w-full items-center gap-2 rounded-xl border px-3 py-2 text-left text-sm transition-colors " +
            (onlyReimb
              ? "border-primary bg-primary/10"
              : "border-border bg-surface hover:bg-surface-2")
          }
        >
          <span style={{ color: "#f59e0b" }}>↩</span>
          <span className="flex-1">
            A receber (reembolsos): <b>{formatMoney(pendingReimbTotal)}</b>
            <span className="text-muted"> · {pendingReimb.length} lanç.</span>
          </span>
          <span className="text-xs text-primary">
            {onlyReimb ? "ver todos" : "ver pendentes"}
          </span>
        </button>
      )}

      {/* Filtros */}
      <div className="mb-4 space-y-2">
        <div className="relative">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted"
          />
          <Input
            type="search"
            name="busca-lancamentos"
            autoComplete="off"
            placeholder="Buscar por descrição ou tag…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            <option value="">Todas as contas</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
          <Select value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="">Todos os tipos</option>
            <option value="expense">Despesas</option>
            <option value="income">Receitas</option>
            <option value="transfer">Transferências</option>
          </Select>
        </div>

        {/* filtro por período */}
        <div className="flex items-center gap-2">
          <Input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="flex-1"
            aria-label="De"
          />
          <span className="text-sm text-muted">até</span>
          <Input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="flex-1"
            aria-label="Até"
          />
          {(from || to) && (
            <button
              onClick={() => {
                setFrom("");
                setTo("");
              }}
              className="rounded-lg px-2 py-1 text-xs text-muted hover:text-text"
            >
              limpar
            </button>
          )}
        </div>

        {/* filtro por tag */}
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-0.5">
            {tags.map((t) => (
              <button
                key={t}
                onClick={() => setTag(tag === t ? "" : t)}
                className={
                  "rounded-full px-2.5 py-1 text-xs font-medium transition-colors " +
                  (tag === t
                    ? "bg-primary text-primary-fg"
                    : "bg-surface-2 text-muted hover:text-text")
                }
              >
                #{t}
              </button>
            ))}
          </div>
        )}
      </div>

      {transactions.length === 0 ? (
        <EmptyState
          title="Nenhum lançamento"
          description="Registre sua primeira entrada ou saída para começar."
          action={
            <Button onClick={openNew}>
              <Plus size={18} /> Novo lançamento
            </Button>
          }
        />
      ) : (
        <div className="space-y-4">
          {grouped.map(({ date, items, total }, gi) => (
            <Card
              key={date}
              className="anim-in p-2"
              style={{ animationDelay: `${Math.min(gi * 60, 300)}ms` }}
            >
              <div className="flex items-center justify-between px-2 py-1">
                <span className="text-xs font-medium text-muted">
                  {formatGroupDate(date)}
                </span>
                <span className="text-xs tabular text-muted">
                  {formatMoney(total)}
                </span>
              </div>
              {items.map((tx) => (
                <TransactionItem
                  key={tx.id}
                  tx={tx}
                  accounts={accountMap}
                  categories={categoryMap}
                  onClick={() => openEdit(tx)}
                />
              ))}
            </Card>
          ))}
        </div>
      )}

      <TransactionForm
        open={formOpen}
        onOpenChange={setFormOpen}
        editing={editing}
        duplicateFrom={duplicateFrom}
        onDuplicate={duplicate}
      />
    </div>
  );
}

interface DateGroup {
  date: string;
  items: Transaction[];
  total: number; // net do dia (receitas - despesas)
}

function groupByDate(transactions: Transaction[]): DateGroup[] {
  const map = new Map<string, Transaction[]>();
  for (const tx of transactions) {
    const arr = map.get(tx.date) ?? [];
    arr.push(tx);
    map.set(tx.date, arr);
  }
  return [...map.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([date, items]) => {
      let total = 0;
      for (const tx of items) {
        if (tx.kind === "income") total += tx.amountCents;
        else if (tx.kind === "expense") total -= tx.amountCents;
      }
      return { date, items, total };
    });
}

function formatGroupDate(date: string): string {
  const today = new Date().toISOString().slice(0, 10);
  if (date === today) return "Hoje";
  const d = new Date(date + "T00:00:00");
  return d.toLocaleDateString("pt-BR", {
    weekday: "short",
    day: "2-digit",
    month: "short",
  });
}
