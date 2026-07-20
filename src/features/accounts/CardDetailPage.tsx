import { useEffect, useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
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
import {
  invoiceSeries,
  invoicePaid,
  effectiveLimit,
  balancesByAccount,
  type InvoiceMonth,
} from "@/lib/calc";
import { formatMoney, parseMoney } from "@/lib/money";
import { formatDayMonth } from "@/lib/format";
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
  return formatDayMonth(iso).replace(".", "");
}

export function CardDetailPage() {
  const { t } = useTranslation();
  const { id } = useParams();
  const account = useAccount(id);
  const transactions = useAllTransactions();
  const allAccounts = useAccounts(true);
  const [chart, setChart] = useState<ChartType>("line");

  // limite efetivo = base + garantia (limite garantido)
  const { effLimit, securedBal, securedName } = useMemo(() => {
    if (!account) return { effLimit: 0, securedBal: 0, securedName: "" };
    const sec = account.securedByAccountId
      ? (balancesByAccount(allAccounts, transactions).get(
          account.securedByAccountId,
        ) ?? 0)
      : 0;
    const name =
      allAccounts.find((a) => a.id === account.securedByAccountId)?.name ?? "";
    return {
      effLimit: effectiveLimit(account, sec),
      securedBal: Math.max(sec, 0),
      securedName: name,
    };
  }, [account, allAccounts, transactions]);
  const [editOpen, setEditOpen] = useState(false);
  const [payMonth, setPayMonth] = useState<InvoiceMonth | undefined>();
  const [newTxOpen, setNewTxOpen] = useState(false);

  const { months, openIndex } = useMemo(
    () => (account ? invoiceSeries(account, transactions) : { months: [], openIndex: -1 }),
    [account, transactions],
  );

  // faturas pagáveis: do passado até a aberta, que tiveram gasto (mais nova primeiro)
  const payable = useMemo(() => {
    if (!account) return [] as InvoiceMonth[];
    return months
      .slice(0, openIndex + 1)
      .filter(
        (m) =>
          m.totalCents > 0 ||
          invoicePaid(account, transactions, m) > 0,
      )
      .reverse();
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
        <EmptyState title={t("acc.notFound")} />
      </div>
    );
  }
  if (account.type !== "credit_card") {
    return (
      <div>
        <BackLink />
        <EmptyState
          title={t("acc.noInvoiceTitle")}
          description={t("acc.noInvoiceDesc")}
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
            <p className="text-sm text-muted">{t("acc.creditCard")}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={() => setNewTxOpen(true)}>
            <Plus size={16} /> {t("acc.post")}
          </Button>
          <button
            onClick={() => setEditOpen(true)}
            className="rounded-xl p-2 text-muted hover:bg-surface-2"
            aria-label={t("common.edit")}
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
          <RingChart open={open} limit={effLimit || undefined} />
        )}

        <div className="my-4 h-px bg-border" />

        {open && (
          <>
            <Row
              label={
                <span className="font-bold text-primary">
                  {t("acc.openInvoice")}
                </span>
              }
              value={
                <span className="text-2xl font-extrabold tabular text-primary">
                  {formatMoney(open.totalCents, account.currency)}
                </span>
              }
            />
            <Row
              label={t("acc.bestBuyDay")}
              value={dayMonth(open.bestBuyDate)}
            />
            <Row label={t("acc.dueDate")} value={dayMonth(open.dueDate)} />
            {effLimit ? (
              <Row
                label={t("acc.limit")}
                value={
                  <span className="text-right">
                    <span className="tabular">
                      {formatMoney(effLimit, account.currency)}
                    </span>
                    {securedBal > 0 && (
                      <span className="block text-xs font-normal text-muted">
                        🔒 {t("acc.securedPart", {
                          value: formatMoney(securedBal, account.currency),
                        })}
                        {securedName ? ` · ${securedName}` : ""}
                      </span>
                    )}
                  </span>
                }
              />
            ) : null}

          </>
        )}
      </Card>

      {/* Faturas — pagar escolhendo o mês */}
      <Card className="mb-4">
        <h2 className="mb-3 text-base font-semibold">{t("acc.invoices")}</h2>
        {payable.length === 0 ? (
          <p className="text-sm text-muted">{t("acc.noInvoicesYet")}</p>
        ) : (
          <div className="space-y-2">
            {payable.map((m) => {
              const paid = invoicePaid(account, transactions, m);
              const remaining = Math.max(m.totalCents - paid, 0);
              const isOpen = m.ym === open?.ym;
              const settled = m.totalCents > 0 && remaining === 0;
              return (
                <div
                  key={m.ym}
                  className="flex items-center gap-3 rounded-xl border border-border p-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">
                      <span className="capitalize">{m.monthLabel}</span>{" "}
                      {m.ym.slice(0, 4)}
                      {isOpen && (
                        <span className="ml-1.5 text-xs font-normal text-primary">
                          · {t("acc.openLabel")}
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-muted">
                      {formatMoney(m.totalCents, account.currency)} ·{" "}
                      {settled ? (
                        <span className="text-income">{t("acc.settled")}</span>
                      ) : (
                        <span className="text-expense">
                          {t("acc.toPayN", {
                            value: formatMoney(remaining, account.currency),
                          })}
                        </span>
                      )}{" "}
                      · {t("acc.dueShort", { date: dayMonth(m.dueDate) })}
                    </p>
                  </div>
                  {settled ? (
                    <span className="inline-flex items-center gap-1 whitespace-nowrap text-xs font-medium text-income">
                      <CheckCircle2 size={15} /> {t("acc.paidShort")}
                    </span>
                  ) : (
                    <Button
                      size="sm"
                      variant={isOpen ? "primary" : "outline"}
                      onClick={() => setPayMonth(m)}
                    >
                      <Wallet size={15} /> {t("acc.pay")}
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {catBreakdown.length > 0 && (
        <Card className="mb-4">
          <h2 className="mb-3 text-sm font-semibold">
            {t("acc.spendByCategory")}
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
                    {cat?.name ?? t("acc.noCategory")}
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
        month={payMonth}
        card={account}
        transactions={transactions}
        onClose={() => setPayMonth(undefined)}
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
  month,
  card,
  transactions,
  onClose,
}: {
  month?: InvoiceMonth;
  card: Account;
  transactions: Transaction[];
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const accounts = useAccounts(true);
  const [amount, setAmount] = useState("");
  const [fromAccount, setFromAccount] = useState("");
  const [date, setDate] = useState("");
  const [error, setError] = useState("");

  const remaining = month
    ? Math.max(month.totalCents - invoicePaid(card, transactions, month), 0)
    : 0;

  useEffect(() => {
    if (!month) return;
    setAmount(
      remaining > 0 ? (remaining / 100).toString().replace(".", ",") : "",
    );
    setFromAccount(accounts.find((a) => a.id !== card.id)?.id ?? "");
    setDate(new Date().toISOString().slice(0, 10));
    setError("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month]);

  if (!month) return null;

  async function handleSubmit() {
    const cents = parseMoney(amount);
    if (!cents || cents <= 0) {
      setError(t("acc.errAmount"));
      return;
    }
    if (!fromAccount) {
      setError(t("acc.errFrom"));
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
      date: date || new Date().toISOString().slice(0, 10),
      description: t("acc.payDescMonth", {
        name: card.name,
        month: month!.monthLabel,
      }),
      tags: ["fatura"],
      status: "cleared",
      paysInvoiceMonth: month!.ym,
    });
    onClose();
    celebrate(
      "coin",
      t("acc.payCelebrate", { value: formatMoney(cents, card.currency) }),
    );
  }

  return (
    <Dialog open={!!month} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        title={t("acc.payMonthTitle", {
          name: card.name,
          month: month.monthLabel,
        })}
      >
        <div className="space-y-4">
          <div>
            <Label>{t("acc.amount")}</Label>
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
            <Label>{t("acc.payWith")}</Label>
            <AccountSelect
              value={fromAccount}
              onChange={setFromAccount}
              accounts={accounts}
              exclude={card.id}
            />
          </div>
          <div>
            <Label>{t("acc.payDate")}</Label>
            <Input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          {error && <p className="text-sm text-expense">{error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={onClose}>
              {t("common.cancel")}
            </Button>
            <Button onClick={handleSubmit}>{t("acc.pay")}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function BackLink() {
  const { t } = useTranslation();
  return (
    <Link
      to="/accounts"
      className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-text"
    >
      <ArrowLeft size={16} /> {t("acc.title")}
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
  const { t } = useTranslation();
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
            <div className="text-[11px] text-muted">
              {t("acc.ringOpenInvoice")}
            </div>
            <div className="text-base font-extrabold tabular">
              {formatMoney(total)}
            </div>
            {limit ? (
              <div className="mt-0.5 text-[10px] text-muted">
                {t("acc.ofLimit", { pct: Math.round(usage * 100) })}
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
