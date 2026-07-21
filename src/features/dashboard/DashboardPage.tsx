import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { useTranslation } from "react-i18next";
import { Plus, Eye, EyeOff, Lock, CalendarClock, Repeat, CreditCard } from "lucide-react";
import { useAccounts, useAllTransactions, useCategories } from "@/db/hooks";
import { db } from "@/db/schema";
import {
  netWorth,
  cashflow,
  spendingBreakdown,
  upcomingDue,
  PRIVATE_BUCKET,
} from "@/lib/calc";
import { projectedNet, lastDayOfMonth } from "@/lib/recurrence";
import { formatMoney } from "@/lib/money";
import { monthShort as monthShortFmt, monthLong } from "@/lib/format";
import { currentMonth, cn } from "@/lib/utils";
import { useSettings, makeRateFn } from "@/lib/settings";
import { usePrivacy, isListed } from "@/lib/privacy";
import { Button, Card } from "@/components/ui/primitives";
import { Sparkline } from "@/components/ui/Sparkline";
import { CategoryIcon } from "@/components/ui/CategoryIcon";
import { PageHeader } from "@/components/PageHeader";
import { QuickActions } from "./QuickActions";
import { InsightsCard } from "./InsightsCard";
import { TransactionItem } from "@/features/transactions/TransactionItem";

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthShort(month: string): string {
  return monthShortFmt(month).replace(".", "");
}

export function DashboardPage() {
  const { t } = useTranslation();
  const accounts = useAccounts();
  const transactions = useAllTransactions();
  const categoriesArr = useCategories();
  const settings = useSettings();
  const { mode: privacyMode } = usePrivacy();
  const [formOpen, setFormOpen] = useState(false);
  const [hideBalance, setHideBalance] = useState(false);

  const thisMonth = currentMonth();
  const [selectedMonth, setSelectedMonth] = useState(thisMonth);
  const monthOptions = useMemo(
    () => [shiftMonth(thisMonth, -2), shiftMonth(thisMonth, -1), thisMonth],
    [thisMonth],
  );

  const from = `${selectedMonth}-01`;
  const to = `${selectedMonth}-31`;

  const rate = useMemo(
    () => makeRateFn(settings.baseCurrency, settings.rates),
    [settings.baseCurrency, settings.rates],
  );

  // saldo até o fim do mês selecionado (hoje, se for o mês atual) — pra as abas
  // de mês moverem o saldão junto com entradas/saídas, não ficar parado em hoje
  const balanceUpTo =
    selectedMonth === thisMonth
      ? new Date().toISOString().slice(0, 10)
      : `${selectedMonth}-31`;
  const totalBalance = useMemo(
    () =>
      netWorth(accounts, transactions, settings.baseCurrency, rate, {
        upToDate: balanceUpTo,
      }),
    [accounts, transactions, settings.baseCurrency, rate, balanceUpTo],
  );

  // série de saldo consolidado no fim de cada um dos últimos 6 meses
  const sparkValues = useMemo(() => {
    const months: string[] = [];
    let m = thisMonth;
    for (let i = 0; i < 6; i++) {
      months.unshift(m);
      m = shiftMonth(m, -1);
    }
    return months.map((mm) =>
      netWorth(accounts, transactions, settings.baseCurrency, rate, {
        upToDate: `${mm}-31`,
      }),
    );
  }, [accounts, transactions, settings.baseCurrency, rate, thisMonth]);

  const cf = useMemo(
    () => cashflow(transactions, from, to),
    [transactions, from, to],
  );

  // recorrências (pra lembretes + saldo previsto)
  const recurrences = useLiveQuery(
    async () => (await db.recurrences.toArray()).filter((r) => r.deleted === 0),
    [],
    [],
  );
  const due = useMemo(
    () => upcomingDue(recurrences, accounts, transactions),
    [recurrences, accounts, transactions],
  );
  const previsto = useMemo(
    () => totalBalance + projectedNet(recurrences, lastDayOfMonth(thisMonth)),
    [totalBalance, recurrences, thisMonth],
  );

  const accountMap = useMemo(
    () => new Map(accounts.map((a) => [a.id, a])),
    [accounts],
  );
  const categoryMap = useMemo(
    () => new Map(categoriesArr.map((c) => [c.id, c])),
    [categoriesArr],
  );

  const spending = useMemo(() => {
    const bd = spendingBreakdown(transactions, from, to, privacyMode);
    const entries = bd.items.map((i) => ({ ...i, isPrivate: false }));
    if (bd.privateTotal > 0)
      entries.push({
        categoryId: PRIVATE_BUCKET,
        total: bd.privateTotal,
        isPrivate: true,
      });
    entries.sort((a, b) => b.total - a.total);
    const TOPN = 6;
    const top = entries.slice(0, TOPN);
    const restTotal = entries.slice(TOPN).reduce((s, t) => s + t.total, 0);
    return { total: bd.total, top, restTotal };
  }, [transactions, from, to, privacyMode]);

  const recent = useMemo(
    () =>
      [...transactions]
        .filter((t) => isListed(t, privacyMode))
        .sort((a, b) =>
          a.date === b.date
            ? b.createdAt.localeCompare(a.createdAt)
            : b.date.localeCompare(a.date),
        )
        .slice(0, 5),
    [transactions, privacyMode],
  );

  const monthLabel = monthLong(from);

  const dueDateLabel = (date: string): string => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const d = new Date(date + "T00:00:00");
    const diff = Math.round((d.getTime() - today.getTime()) / 86400000);
    if (diff <= 0) return t("dashboard.today");
    if (diff === 1) return t("dashboard.tomorrow");
    if (diff <= 13) return t("dashboard.inDays", { count: diff });
    const [, m, dd] = date.split("-");
    return `${dd}/${m}`;
  };

  return (
    <div>
      <PageHeader
        title={t("dashboard.title")}
        subtitle={capitalize(monthLabel)}
        action={
          <Button onClick={() => setFormOpen(true)}>
            <Plus size={18} /> {t("dashboard.newEntry")}
          </Button>
        }
      />

      {/* Card de saldo (estilo B: minimal + sparkline) */}
      <Card className="anim-in mb-4 overflow-hidden">
        <div className="inline-flex gap-0.5 rounded-xl bg-surface-2 p-1">
          {monthOptions.map((mm) => (
            <button
              key={mm}
              onClick={() => setSelectedMonth(mm)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-xs font-semibold capitalize transition-colors",
                selectedMonth === mm
                  ? "bg-surface text-text shadow-sm"
                  : "text-muted hover:text-text",
              )}
            >
              {monthShort(mm)}
            </button>
          ))}
        </div>

        <div className="mt-4 flex items-center justify-between text-sm text-muted">
          <span>{t("dashboard.consolidatedBalance")}</span>
          <button
            onClick={() => setHideBalance((v) => !v)}
            className="rounded-lg p-1 hover:bg-surface-2"
            aria-label={
              hideBalance
                ? t("dashboard.showBalance")
                : t("dashboard.hideBalance")
            }
          >
            {hideBalance ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </div>

        <p className="mt-0.5 text-[32px] font-extrabold leading-tight tracking-tight tabular">
          {hideBalance
            ? "••••••"
            : formatMoney(totalBalance, settings.baseCurrency)}
        </p>

        <div className="mb-3 mt-3 flex gap-5 text-sm">
          <span className="text-muted">
            {t("dashboard.income")}{" "}
            <b className="font-bold text-income">
              +{formatMoney(cf.income, settings.baseCurrency)}
            </b>
          </span>
          <span className="text-muted">
            {t("dashboard.expenses")}{" "}
            <b className="font-bold text-expense">
              −{formatMoney(cf.expense, settings.baseCurrency)}
            </b>
          </span>
        </div>

        {!hideBalance &&
          selectedMonth === thisMonth &&
          previsto !== totalBalance && (
            <p className="mb-3 -mt-1 text-xs text-muted">
              {t("dashboard.projectedShort")}{" "}
              <b className="tabular text-text">
                {formatMoney(previsto, settings.baseCurrency)}
              </b>{" "}
              <span className="text-[11px]">
                {t("dashboard.withRecurring")}
              </span>
            </p>
          )}

        <div className="-mx-4 -mb-4">
          <Sparkline values={sparkValues} />
        </div>
      </Card>

      {/* Insights de IA (aparece só com IA ligada + logado) */}
      <InsightsCard />

      {/* Próximos vencimentos (lembretes) */}
      {due.length > 0 && (
        <Card className="anim-in mb-4" style={{ animationDelay: "40ms" }}>
          <div className="mb-2 flex items-center gap-2">
            <CalendarClock size={18} className="text-primary" />
            <h2 className="text-base font-semibold">
              {t("dashboard.upcoming")}
            </h2>
          </div>
          <div className="space-y-0.5">
            {due.map((d, i) => (
              <div
                key={i}
                className="flex items-center gap-2.5 py-1 text-sm"
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface-2 text-muted">
                  {d.kind === "invoice" ? (
                    <CreditCard size={14} />
                  ) : (
                    <Repeat size={14} />
                  )}
                </span>
                <span className="flex-1 truncate">{d.label}</span>
                <span className="shrink-0 text-xs text-muted">
                  {dueDateLabel(d.date)}
                </span>
                <span
                  className="shrink-0 tabular text-sm font-semibold"
                  style={{
                    color:
                      d.flow === "income" ? "var(--income)" : "var(--text)",
                  }}
                >
                  {formatMoney(d.amountCents, settings.baseCurrency)}
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Gastos do mês (barra empilhada + legenda) */}
      {spending.total > 0 && (
        <Card className="anim-in mb-4" style={{ animationDelay: "80ms" }}>
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="text-base font-semibold">
              {t("dashboard.topSpending")}
            </h2>
            <span className="tabular font-bold">
              {formatMoney(spending.total, settings.baseCurrency)}
            </span>
          </div>

          {/* barra empilhada */}
          <div className="bar-grow flex h-4 overflow-hidden rounded-lg bg-surface-2">
            {spending.top.map((item) => {
              const cat =
                !item.isPrivate && item.categoryId
                  ? categoryMap.get(item.categoryId)
                  : undefined;
              return (
                <div
                  key={item.categoryId ?? "none"}
                  style={{
                    width: `${(item.total / spending.total) * 100}%`,
                    backgroundColor: item.isPrivate
                      ? "#64748b"
                      : (cat?.color ?? "#94a3b8"),
                  }}
                />
              );
            })}
            {spending.restTotal > 0 && (
              <div
                style={{
                  width: `${(spending.restTotal / spending.total) * 100}%`,
                  backgroundColor: "#64748b",
                }}
              />
            )}
          </div>

          {/* legenda */}
          <div className="mt-3 space-y-0.5">
            {spending.top.map((item) => {
              if (item.isPrivate) {
                return (
                  <div
                    key="private"
                    className="flex items-center gap-2.5 py-0.5 text-sm"
                  >
                    <span className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full bg-[#64748b]/20 text-[#94a3b8]">
                      <Lock size={13} />
                    </span>
                    <span className="flex-1 truncate text-muted">
                      {t("dashboard.private")}
                    </span>
                    <span className="tabular text-muted">•••••</span>
                  </div>
                );
              }
              const cat = item.categoryId
                ? categoryMap.get(item.categoryId)
                : undefined;
              return (
                <div
                  key={item.categoryId ?? "none"}
                  className="flex items-center gap-2.5 py-0.5 text-sm"
                >
                  <CategoryIcon
                    icon={cat?.icon}
                    color={cat?.color ?? "#94a3b8"}
                    size={26}
                  />
                  <span className="flex-1 truncate">
                    {cat?.name ?? t("dashboard.noCategory")}
                  </span>
                  <span className="tabular text-muted">
                    {formatMoney(item.total)}
                  </span>
                </div>
              );
            })}
            {spending.restTotal > 0 && (
              <div className="flex items-center gap-2.5 py-0.5 text-sm">
                <span className="h-[26px] w-[26px] shrink-0 rounded-full bg-[#64748b]/20" />
                <span className="flex-1 text-muted">{t("dashboard.others")}</span>
                <span className="tabular text-muted">
                  {formatMoney(spending.restTotal)}
                </span>
              </div>
            )}
          </div>
        </Card>
      )}

      {/* Recentes */}
      {recent.length > 0 && (
        <Card className="anim-in p-2" style={{ animationDelay: "160ms" }}>
          <h2 className="px-2 py-1 text-base font-semibold">
            {t("dashboard.recent")}
          </h2>
          {recent.map((tx) => (
            <TransactionItem
              key={tx.id}
              tx={tx}
              accounts={accountMap}
              categories={categoryMap}
            />
          ))}
        </Card>
      )}

      <QuickActions open={formOpen} onOpenChange={setFormOpen} />
    </div>
  );
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
