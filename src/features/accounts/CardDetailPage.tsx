import { useEffect, useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import {
  ArrowLeft,
  Pencil,
  Plus,
  LineChart as LineIcon,
  BarChart3,
  PieChart as PieIcon,
  CheckCircle2,
  Wallet,
} from "lucide-react";
import { useAccount, useAllTransactions, useAccounts } from "@/db/hooks";
import { invoiceSeries, type InvoiceMonth } from "@/lib/calc";
import { formatMoney, parseMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
import { create } from "@/db/repo";
import { celebrate } from "@/components/feedback/Feito";
import {
  Button,
  Card,
  EmptyState,
  Input,
  Label,
} from "@/components/ui/primitives";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { AccountForm } from "./AccountForm";
import { AccountSelect } from "./AccountSelect";
import { TransactionForm } from "@/features/transactions/TransactionForm";
import { useCategories } from "@/db/hooks";
import { CategoryIcon } from "@/components/ui/CategoryIcon";
import type { Account, Transaction } from "@/db/types";

type ChartType = "line" | "bars" | "ring";

function dayMonth(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return d
    .toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })
    .replace(".", "");
}

export function CardDetailPage() {
  const { id } = useParams();
  const account = useAccount(id);
  const transactions = useAllTransactions();
  const [chart, setChart] = useState<ChartType>("line");
  const [editOpen, setEditOpen] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [newTxOpen, setNewTxOpen] = useState(false);

  const { months, openIndex } = useMemo(
    () => (account ? invoiceSeries(account, transactions) : { months: [], openIndex: -1 }),
    [account, transactions],
  );

  // quanto já foi pago na fatura aberta (transferências PARA o cartão no ciclo)
  const paidInCycle = useMemo(() => {
    const open = months[openIndex];
    if (!account || !open) return 0;
    return transactions
      .filter(
        (t) =>
          !t.deleted &&
          t.status !== "pending" &&
          t.kind === "transfer" &&
          t.toAccountId === account.id &&
          t.date >= open.cycleStart &&
          t.date <= open.closeDate,
      )
      .reduce((s, t) => s + t.amountCents, 0);
  }, [account, transactions, months, openIndex]);

  // gastos da fatura aberta por categoria (atribui itens da divisão à sua categoria)
  const categories = useCategories();
  const catBreakdown = useMemo(() => {
    const open = months[openIndex];
    if (!account || !open) return [] as { cid: string | null; cents: number }[];
    const m = new Map<string | null, number>();
    for (const t of transactions) {
      if (t.deleted || t.status === "pending") continue;
      if (t.accountId !== account.id) continue;
      if (t.date < open.cycleStart || t.date > open.closeDate) continue;
      if (t.kind === "expense") {
        if (t.splits?.length) {
          for (const s of t.splits) {
            const k = s.categoryId ?? null;
            m.set(k, (m.get(k) ?? 0) + s.amountCents);
          }
        } else {
          const k = t.categoryId ?? null;
          m.set(k, (m.get(k) ?? 0) + t.amountCents);
        }
      } else if (t.kind === "income") {
        // estorno/crédito abate da própria categoria
        const k = t.categoryId ?? null;
        m.set(k, (m.get(k) ?? 0) - t.amountCents);
      }
    }
    return [...m.entries()]
      .map(([cid, cents]) => ({ cid, cents }))
      .filter((e) => e.cents > 0)
      .sort((a, b) => b.cents - a.cents);
  }, [account, transactions, months, openIndex]);

  if (!account) {
    return (
      <div>
        <BackLink />
        <EmptyState title="Conta não encontrada" />
      </div>
    );
  }
  if (account.type !== "credit_card") {
    return (
      <div>
        <BackLink />
        <EmptyState
          title="Sem fatura"
          description="Esta conta não é um cartão de crédito."
        />
      </div>
    );
  }

  const open = months[openIndex];

  return (
    <div>
      <BackLink />
      <div className="mb-5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span
            className="flex h-11 w-11 items-center justify-center rounded-xl text-white"
            style={{ background: account.color }}
          >
            💳
          </span>
          <div>
            <h1 className="text-xl font-bold leading-tight">{account.name}</h1>
            <p className="text-sm text-muted">Cartão de crédito</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={() => setNewTxOpen(true)}>
            <Plus size={16} /> Lançar
          </Button>
          <button
            onClick={() => setEditOpen(true)}
            className="rounded-xl p-2 text-muted hover:bg-surface-2"
            aria-label="Editar"
          >
            <Pencil size={18} />
          </button>
        </div>
      </div>

      <Card className="mb-4">
        {/* seletor de tipo de gráfico */}
        <div className="mb-4 flex justify-end">
          <div className="inline-flex gap-0.5 rounded-xl bg-surface-2 p-1">
            {(
              [
                ["line", LineIcon],
                ["bars", BarChart3],
                ["ring", PieIcon],
              ] as const
            ).map(([t, Icon]) => (
              <button
                key={t}
                onClick={() => setChart(t)}
                className={cn(
                  "rounded-lg p-1.5 transition-colors",
                  chart === t
                    ? "bg-surface text-primary shadow-sm"
                    : "text-muted hover:text-text",
                )}
                aria-label={t}
              >
                <Icon size={16} />
              </button>
            ))}
          </div>
        </div>

        {chart === "line" && (
          <LineChart months={months} openIndex={openIndex} />
        )}
        {chart === "bars" && (
          <BarsChart months={months} openIndex={openIndex} />
        )}
        {chart === "ring" && (
          <RingChart open={open} limit={account.creditLimitCents} />
        )}

        <div className="my-4 h-px bg-border" />

        {open && (
          <>
            <Row
              label={<span className="font-bold text-primary">Fatura aberta</span>}
              value={
                <span className="text-2xl font-extrabold tabular text-primary">
                  {formatMoney(open.totalCents, account.currency)}
                </span>
              }
            />
            <Row label="Melhor dia de compra" value={dayMonth(open.bestBuyDate)} />
            <Row label="Vencimento" value={dayMonth(open.dueDate)} />
            {account.creditLimitCents ? (
              <Row
                label="Limite"
                value={formatMoney(account.creditLimitCents, account.currency)}
              />
            ) : null}

            {(() => {
              const remaining = open.totalCents - paidInCycle;
              return (
                <div className="mt-3 border-t border-border pt-3">
                  {open.totalCents === 0 && paidInCycle === 0 ? (
                    <p className="mb-3 text-center text-sm text-muted">
                      Sem gastos nesta fatura.
                    </p>
                  ) : remaining > 0 ? (
                    <>
                      <Row
                        label="A pagar"
                        value={
                          <span className="tabular font-bold text-expense">
                            {formatMoney(remaining, account.currency)}
                          </span>
                        }
                      />
                      {paidInCycle > 0 && (
                        <Row
                          label="Já pago"
                          value={formatMoney(paidInCycle, account.currency)}
                        />
                      )}
                    </>
                  ) : remaining === 0 ? (
                    <div className="mb-3 flex items-center justify-center gap-2 text-sm font-semibold text-income">
                      <CheckCircle2 size={18} /> Fatura paga
                    </div>
                  ) : (
                    <Row
                      label="Adiantado (crédito)"
                      value={
                        <span className="tabular font-bold text-income">
                          {formatMoney(-remaining, account.currency)}
                        </span>
                      }
                    />
                  )}
                  <Button
                    className="mt-3 w-full"
                    variant={remaining > 0 ? "primary" : "outline"}
                    onClick={() => setPayOpen(true)}
                  >
                    <Wallet size={16} />{" "}
                    {remaining > 0 ? "Pagar fatura" : "Pagar / adiantar"}
                  </Button>
                </div>
              );
            })()}
          </>
        )}
      </Card>

      {catBreakdown.length > 0 && (
        <Card className="mb-4">
          <h2 className="mb-3 text-sm font-semibold">
            Gastos da fatura por categoria
          </h2>
          {catBreakdown.map(({ cid, cents }, i) => {
            const cat = cid ? categories.find((c) => c.id === cid) : null;
            const max = catBreakdown[0].cents || 1;
            return (
              <div key={cid ?? "__none__"} className="mb-2.5 last:mb-0">
                <div className="flex items-center gap-2.5">
                  <CategoryIcon
                    icon={cat?.icon}
                    color={cat?.color ?? "#94a3b8"}
                    size={30}
                  />
                  <span className="flex-1 text-sm">
                    {cat?.name ?? "Sem categoria"}
                  </span>
                  <span className="tabular text-sm font-semibold">
                    {formatMoney(cents, account.currency)}
                  </span>
                </div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-2">
                  <div
                    className="bar-grow h-full rounded-full"
                    style={{
                      width: `${(cents / max) * 100}%`,
                      background: cat?.color ?? "var(--muted)",
                      animationDelay: `${Math.min(i * 50, 300)}ms`,
                    }}
                  />
                </div>
              </div>
            );
          })}
        </Card>
      )}

      <PayInvoiceDialog
        open={payOpen}
        onOpenChange={setPayOpen}
        card={account}
        amountDueCents={open ? open.totalCents - paidInCycle : 0}
      />
      <AccountForm open={editOpen} onOpenChange={setEditOpen} editing={account} />
      <TransactionForm
        open={newTxOpen}
        onOpenChange={setNewTxOpen}
        defaultAccountId={account.id}
      />
    </div>
  );
}

function PayInvoiceDialog({
  open,
  onOpenChange,
  card,
  amountDueCents,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  card: Account;
  amountDueCents: number;
}) {
  const accounts = useAccounts(true);
  const sources = accounts.filter((a) => a.id !== card.id);
  const [amount, setAmount] = useState("");
  const [fromAccount, setFromAccount] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setAmount(
      amountDueCents > 0
        ? (amountDueCents / 100).toString().replace(".", ",")
        : "",
    );
    setFromAccount(sources[0]?.id ?? "");
    setError("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function handleSubmit() {
    const cents = parseMoney(amount);
    if (!cents || cents <= 0) {
      setError("Informe um valor válido.");
      return;
    }
    if (!fromAccount) {
      setError("Escolha a conta de onde sai o pagamento.");
      return;
    }
    const acc = accounts.find((a) => a.id === fromAccount);
    await create<Transaction>("transactions", {
      accountId: fromAccount,
      toAccountId: card.id,
      categoryId: null,
      kind: "transfer",
      amountCents: cents,
      currency: acc?.currency ?? card.currency,
      date: new Date().toISOString().slice(0, 10),
      description: `Pagamento fatura ${card.name}`,
      tags: ["fatura"],
      status: "cleared",
    });
    onOpenChange(false);
    celebrate("coin", `Fatura paga · ${formatMoney(cents, card.currency)}`);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={`Pagar fatura · ${card.name}`}>
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
          <div>
            <Label>Pagar com</Label>
            <AccountSelect
              value={fromAccount}
              onChange={setFromAccount}
              accounts={accounts}
              exclude={card.id}
            />
          </div>
          {error && <p className="text-sm text-expense">{error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSubmit}>Pagar</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function BackLink() {
  return (
    <Link
      to="/accounts"
      className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-text"
    >
      <ArrowLeft size={16} /> Contas
    </Link>
  );
}

function Row({
  label,
  value,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between py-1.5 text-sm">
      <span className="text-muted">{label}</span>
      <span className="font-semibold">{value}</span>
    </div>
  );
}

/* ----------------------------- gráfico: linha ----------------------------- */
function LineChart({
  months,
  openIndex,
}: {
  months: InvoiceMonth[];
  openIndex: number;
}) {
  const vals = months.map((m) => m.totalCents);
  const max = Math.max(...vals, 1);
  const min = Math.min(...vals);
  const range = max - min || 1;
  const xs = months.map((_, i) => 50 + i * 100); // 50,150,250,350
  const ys = vals.map((v) => 72 - ((v - min) / range) * 52); // 20..72 invertido
  const path = xs.map((x, i) => `${i === 0 ? "M" : "L"}${x},${ys[i].toFixed(1)}`).join(" ");

  return (
    <div className="relative h-24">
      <div
        className="absolute -top-1 bottom-7 rounded-2xl border border-border bg-surface-2"
        style={{ left: `${openIndex * 25}%`, width: "25%" }}
      />
      <svg
        viewBox="0 0 400 96"
        preserveAspectRatio="none"
        className="absolute inset-x-0 top-0 h-[68px] w-full"
      >
        <path
          d={path}
          fill="none"
          stroke="#6366f1"
          strokeWidth={2.5}
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
        {xs.map((x, i) => (
          <circle
            key={i}
            cx={x}
            cy={ys[i]}
            r={i === openIndex ? 5.5 : 4}
            fill={i === openIndex ? "#6366f1" : "#1b2236"}
            stroke="#6366f1"
            strokeWidth={2}
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </svg>
      <MonthLabels months={months} openIndex={openIndex} />
    </div>
  );
}

/* ----------------------------- gráfico: barras ---------------------------- */
function BarsChart({
  months,
  openIndex,
}: {
  months: InvoiceMonth[];
  openIndex: number;
}) {
  const max = Math.max(...months.map((m) => m.totalCents), 1);
  return (
    <div className="grid h-24 grid-cols-4 items-end gap-3">
      {months.map((m, i) => (
        <div key={m.ym} className="flex h-full flex-col items-center justify-end gap-1.5">
          <span className="text-[10px] text-muted">
            {formatMoney(m.totalCents).replace("R$", "").trim()}
          </span>
          <div
            className={cn(
              "w-[68%] rounded-t-lg",
              i === openIndex ? "bg-primary" : "bg-surface-2",
            )}
            style={{
              height: `${Math.max((m.totalCents / max) * 100, 5)}%`,
              background:
                i === openIndex
                  ? "linear-gradient(180deg,#818cf8,#6366f1)"
                  : undefined,
            }}
          />
          <span
            className={cn(
              "text-xs font-semibold capitalize",
              i === openIndex ? "text-primary" : "text-muted",
            )}
          >
            {m.monthLabel}
          </span>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------ gráfico: anel ----------------------------- */
function RingChart({
  open,
  limit,
}: {
  open?: InvoiceMonth;
  limit?: number;
}) {
  const total = open?.totalCents ?? 0;
  const usage = limit && limit > 0 ? Math.min(total / limit, 1) : 0;
  const dash = usage * 100;
  return (
    <div className="flex items-center justify-center py-2">
      <div className="relative h-32 w-32">
        <svg width="128" height="128" viewBox="0 0 42 42">
          <circle cx="21" cy="21" r="15.9" fill="none" stroke="var(--surface-2)" strokeWidth="4" />
          <circle
            cx="21"
            cy="21"
            r="15.9"
            fill="none"
            stroke="#6366f1"
            strokeWidth="4"
            strokeDasharray={`${dash} ${100 - dash}`}
            strokeDashoffset="25"
            strokeLinecap="round"
            transform="rotate(-90 21 21)"
          />
        </svg>
        <div className="absolute inset-0 grid place-items-center text-center">
          <div>
            <div className="text-[11px] text-muted">fatura aberta</div>
            <div className="text-base font-extrabold tabular">
              {formatMoney(total)}
            </div>
            {limit ? (
              <div className="mt-0.5 text-[10px] text-muted">
                {Math.round(usage * 100)}% do limite
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function MonthLabels({
  months,
  openIndex,
}: {
  months: InvoiceMonth[];
  openIndex: number;
}) {
  return (
    <div className="absolute inset-x-0 bottom-0 grid grid-cols-4">
      {months.map((m, i) => (
        <div key={m.ym} className="text-center">
          <div
            className={cn(
              "text-xs font-semibold capitalize",
              i === openIndex ? "text-primary" : "text-text",
            )}
          >
            {m.monthLabel}
          </div>
          <div
            className={cn(
              "text-[10px]",
              i === openIndex ? "text-text" : "text-muted",
            )}
          >
            {formatMoney(m.totalCents).replace("R$ ", "R$ ")}
          </div>
        </div>
      ))}
    </div>
  );
}
