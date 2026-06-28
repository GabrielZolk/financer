import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
} from "recharts";
import { Lock } from "lucide-react";
import { useAllTransactions, useCategories } from "@/db/hooks";
import {
  cashflow,
  totalsByCategory,
  spendingBreakdown,
} from "@/lib/calc";
import { formatMoney, fromCents } from "@/lib/money";
import { monthShort } from "@/lib/format";
import { currentMonth } from "@/lib/utils";
import { usePrivacy } from "@/lib/privacy";
import { Card, EmptyState } from "@/components/ui/primitives";
import { CategoryIcon } from "@/components/ui/CategoryIcon";
import { PageHeader } from "@/components/PageHeader";
import { cn } from "@/lib/utils";

type Period = "month" | "3m" | "6m" | "year";

const PERIODS: { key: Period; labelKey: string }[] = [
  { key: "month", labelKey: "reports.periodMonth" },
  { key: "3m", labelKey: "reports.period3m" },
  { key: "6m", labelKey: "reports.period6m" },
  { key: "year", labelKey: "reports.periodYear" },
];

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
const monthEnd = (m: string) => `${m}-31`;
const monthStart = (m: string) => `${m}-01`;

interface Range {
  from: string;
  to: string;
  prevFrom: string;
  prevTo: string;
}
function periodRange(period: Period): Range {
  const ref = currentMonth();
  if (period === "month") {
    return {
      from: monthStart(ref),
      to: monthEnd(ref),
      prevFrom: monthStart(shiftMonth(ref, -1)),
      prevTo: monthEnd(shiftMonth(ref, -1)),
    };
  }
  if (period === "year") {
    const y = ref.slice(0, 4);
    return {
      from: `${y}-01-01`,
      to: `${y}-12-31`,
      prevFrom: `${+y - 1}-01-01`,
      prevTo: `${+y - 1}-12-31`,
    };
  }
  const n = period === "3m" ? 3 : 6;
  return {
    from: monthStart(shiftMonth(ref, -(n - 1))),
    to: monthEnd(ref),
    prevFrom: monthStart(shiftMonth(ref, -(2 * n - 1))),
    prevTo: monthEnd(shiftMonth(ref, -n)),
  };
}

function daysElapsed(from: string, to: string): number {
  const today = new Date().toISOString().slice(0, 10);
  const end = to < today ? to : today;
  const d =
    (Date.parse(end + "T00:00:00") - Date.parse(from + "T00:00:00")) /
      86400000 +
    1;
  return Math.max(1, Math.round(d));
}

function pctDelta(cur: number, prev: number): number | null {
  if (prev <= 0) return null;
  return ((cur - prev) / prev) * 100;
}

function DeltaChip({ delta }: { delta: number | null }) {
  if (delta === null) return null;
  const down = delta <= 0; // gastar menos = bom (verde)
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-[11px] font-bold",
        down ? "bg-income/15 text-income" : "bg-expense/15 text-expense",
      )}
    >
      {down ? "↓" : "↑"} {Math.abs(Math.round(delta))}%
    </span>
  );
}

export function ReportsPage() {
  const { t } = useTranslation();
  const transactions = useAllTransactions();
  const { mode: privacyMode } = usePrivacy();
  const categories = useCategories("expense");
  const categoryMap = useMemo(
    () => new Map(categories.map((c) => [c.id, c])),
    [categories],
  );

  const [period, setPeriod] = useState<Period>("month");
  const [trendCat, setTrendCat] = useState<string>(""); // "" = total

  const range = useMemo(() => periodRange(period), [period]);

  // resumo (cards)
  const summary = useMemo(() => {
    const cur = cashflow(transactions, range.from, range.to);
    const prev = cashflow(transactions, range.prevFrom, range.prevTo);
    const bd = spendingBreakdown(transactions, range.from, range.to, privacyMode);
    const top = [...bd.items];
    if (bd.privateTotal > 0)
      top.push({ categoryId: "__private__", total: bd.privateTotal });
    top.sort((a, b) => b.total - a.total);
    const biggest = top[0];
    const days = daysElapsed(range.from, range.to);
    return {
      expense: cur.expense,
      expenseDelta: pctDelta(cur.expense, prev.expense),
      economia: cur.net,
      perDay: Math.round(cur.expense / days),
      biggest,
      biggestPct: bd.total > 0 && biggest ? (biggest.total / bd.total) * 100 : 0,
    };
  }, [transactions, range, privacyMode]);

  // tendência: últimos 6 meses (total ou categoria selecionada)
  const trend = useMemo(() => {
    const ref = currentMonth();
    const months = Array.from({ length: 6 }, (_, i) => shiftMonth(ref, i - 5));
    const pts = months.map((m) => {
      const f = monthStart(m);
      const t = monthEnd(m);
      const value = trendCat
        ? (totalsByCategory(transactions, "expense", f, t).find(
            (x) => x.categoryId === trendCat,
          )?.total ?? 0)
        : cashflow(transactions, f, t).expense;
      return {
        month: monthShort(m).replace(".", ""),
        valor: fromCents(value),
        cents: value,
      };
    });
    const avg = pts.reduce((s, p) => s + p.cents, 0) / (pts.length || 1);
    return { pts, avg };
  }, [transactions, trendCat]);

  // categorias com delta (período atual vs anterior)
  const catList = useMemo(() => {
    const bd = spendingBreakdown(transactions, range.from, range.to, privacyMode);
    const prev = totalsByCategory(
      transactions.filter((t) => t.private !== 1),
      "expense",
      range.prevFrom,
      range.prevTo,
    );
    const prevMap = new Map(prev.map((p) => [p.categoryId, p.total]));
    const items = bd.items.slice(0, 8).map((t) => ({
      categoryId: t.categoryId,
      total: t.total,
      delta: pctDelta(t.total, prevMap.get(t.categoryId) ?? 0),
      isPrivate: false,
    }));
    if (bd.privateTotal > 0) {
      items.push({
        categoryId: "__private__",
        total: bd.privateTotal,
        delta: null,
        isPrivate: true,
      });
    }
    return { items: items.sort((a, b) => b.total - a.total), total: bd.total };
  }, [transactions, range, privacyMode]);

  if (transactions.length === 0) {
    return (
      <div>
        <PageHeader title={t("reports.title")} />
        <EmptyState
          title={t("reports.emptyTitle")}
          description={t("reports.emptyDesc")}
        />
      </div>
    );
  }

  const biggestCat =
    summary.biggest?.categoryId && summary.biggest.categoryId !== "__private__"
      ? categoryMap.get(summary.biggest.categoryId)
      : undefined;
  const biggestName =
    summary.biggest?.categoryId === "__private__"
      ? t("reports.private")
      : (biggestCat?.name ?? "—");

  return (
    <div>
      <PageHeader title={t("reports.title")} />

      {/* seletor de período */}
      <div className="mb-4 inline-flex gap-0.5 rounded-xl bg-surface-2 p-1">
        {PERIODS.map((p) => (
          <button
            key={p.key}
            onClick={() => setPeriod(p.key)}
            className={cn(
              "rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors",
              period === p.key
                ? "bg-surface text-text shadow-sm"
                : "text-muted hover:text-text",
            )}
          >
            {t(p.labelKey)}
          </button>
        ))}
      </div>

      {/* cards de insight */}
      <div className="mb-4 grid grid-cols-2 gap-3">
        <Card className="anim-in">
          <p className="text-xs text-muted">{t("reports.spentInPeriod")}</p>
          <p className="mt-0.5 text-xl font-extrabold tabular">
            {formatMoney(summary.expense)}
          </p>
          <div className="mt-1">
            {summary.expenseDelta !== null ? (
              <span className="text-[11px] text-muted">
                {t("reports.vsPrev")} <DeltaChip delta={summary.expenseDelta} />
              </span>
            ) : (
              <span className="text-[11px] text-muted">
                {t("reports.noPrev")}
              </span>
            )}
          </div>
        </Card>
        <Card className="anim-in" style={{ animationDelay: "60ms" }}>
          <p className="text-xs text-muted">{t("reports.savings")}</p>
          <p
            className="mt-0.5 text-xl font-extrabold tabular"
            style={{ color: summary.economia >= 0 ? "var(--income)" : "var(--expense)" }}
          >
            {formatMoney(summary.economia)}
          </p>
          <p className="mt-1 text-[11px] text-muted">
            {t("reports.incomeMinusExpense")}
          </p>
        </Card>
        <Card className="anim-in" style={{ animationDelay: "120ms" }}>
          <p className="text-xs text-muted">{t("reports.biggestCategory")}</p>
          <div className="mt-1 flex items-center gap-2">
            {summary.biggest?.categoryId === "__private__" ? (
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#64748b]/20 text-[#94a3b8]">
                <Lock size={13} />
              </span>
            ) : (
              <CategoryIcon icon={biggestCat?.icon} color={biggestCat?.color} size={28} />
            )}
            <div className="min-w-0">
              <p className="truncate text-sm font-bold">{biggestName}</p>
              <p className="text-[11px] text-muted">
                {t("reports.pctOfSpending", {
                  pct: Math.round(summary.biggestPct),
                })}
              </p>
            </div>
          </div>
        </Card>
        <Card className="anim-in" style={{ animationDelay: "180ms" }}>
          <p className="text-xs text-muted">{t("reports.perDay")}</p>
          <p className="mt-0.5 text-xl font-extrabold tabular">
            {formatMoney(summary.perDay)}
          </p>
          <p className="mt-1 text-[11px] text-muted">{t("reports.inPeriod")}</p>
        </Card>
      </div>

      {/* tendência (6 meses) com seletor de categoria */}
      <Card className="mb-4">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 className="text-base font-semibold">{t("reports.trend")}</h2>
          <select
            value={trendCat}
            onChange={(e) => setTrendCat(e.target.value)}
            className="h-8 rounded-lg border border-border bg-surface px-2 text-xs outline-none"
          >
            <option value="">{t("reports.total")}</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <p className="mb-2 text-xs text-muted">
          {t("reports.avgPerMonth", {
            value: formatMoney(Math.round(trend.avg)),
          })}
        </p>
        <div className="h-44">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={trend.pts} margin={{ top: 6, right: 6, left: 6, bottom: 0 }}>
              <XAxis
                dataKey="month"
                tick={{ fontSize: 12, fill: "var(--muted)" }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                formatter={(v: number) => formatMoney(Math.round(v * 100))}
                contentStyle={{
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                  borderRadius: 12,
                  fontSize: 12,
                }}
                labelStyle={{ color: "var(--muted)" }}
              />
              <Line
                type="monotone"
                dataKey="valor"
                stroke="var(--primary)"
                strokeWidth={2.5}
                dot={{ r: 3, fill: "var(--primary)" }}
                activeDot={{ r: 5 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* categorias com delta */}
      <Card>
        <h2 className="mb-3 text-base font-semibold">
          {t("reports.byCategory")}
        </h2>
        <div className="space-y-0.5">
          {catList.items.map((c) => {
            if (c.isPrivate) {
              return (
                <div key="priv" className="flex items-center gap-2.5 py-1.5 text-sm">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#64748b]/20 text-[#94a3b8]">
                    <Lock size={13} />
                  </span>
                  <span className="flex-1 text-muted">
                    {t("reports.private")}
                  </span>
                  <span className="tabular text-muted">•••••</span>
                </div>
              );
            }
            const cat = c.categoryId ? categoryMap.get(c.categoryId) : undefined;
            return (
              <div
                key={c.categoryId ?? "none"}
                className="flex items-center gap-2.5 py-1.5 text-sm"
              >
                <CategoryIcon icon={cat?.icon} color={cat?.color ?? "#94a3b8"} size={28} />
                <span className="flex-1 truncate">
                  {cat?.name ?? t("reports.noCategory")}
                </span>
                <DeltaChip delta={c.delta} />
                <span className="w-20 text-right tabular text-muted">
                  {formatMoney(c.total)}
                </span>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
