import { useState } from "react";
import {
  ArrowLeftRight,
  ArrowDownLeft,
  ArrowUpRight,
  ChevronDown,
  Lock,
} from "lucide-react";
import type { Account, Category, Transaction } from "@/db/types";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
import { iconFor } from "@/lib/icons";
import { CategoryIcon } from "@/components/ui/CategoryIcon";

export function TransactionItem({
  tx,
  accounts,
  categories,
  onClick,
}: {
  tx: Transaction;
  accounts: Map<string, Account>;
  categories: Map<string, Category>;
  onClick?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const account = accounts.get(tx.accountId);
  const category = tx.categoryId ? categories.get(tx.categoryId) : undefined;
  const isIncome = tx.kind === "income";
  const isTransfer = tx.kind === "transfer";
  const hasSplits = !!tx.splits?.length;

  const color = isTransfer
    ? "#64748b"
    : (category?.color ?? (isIncome ? "#22c55e" : "#94a3b8"));
  const Icon = isTransfer
    ? ArrowLeftRight
    : category
      ? iconFor(category.icon)
      : isIncome
        ? ArrowDownLeft
        : ArrowUpRight;

  const sign = isIncome ? "+" : isTransfer ? "" : "-";
  const amountClass = isIncome
    ? "text-income"
    : isTransfer
      ? "text-muted"
      : "text-text";

  const subtitle = isTransfer
    ? `${account?.name ?? "?"} → ${accounts.get(tx.toAccountId ?? "")?.name ?? "?"}`
    : hasSplits
      ? `${tx.splits!.length} categorias · ${account?.name ?? ""}`
      : `${category?.name ?? "Sem categoria"} · ${account?.name ?? ""}`;

  return (
    <div>
      <div className="flex w-full items-center gap-1 rounded-xl px-2 py-2.5 transition-colors hover:bg-surface-2">
        <button
          onClick={onClick}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
        >
          <span
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
            style={{ backgroundColor: `${color}22`, color }}
          >
            <Icon size={18} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-2 truncate text-sm font-medium">
              {tx.private === 1 && (
                <Lock size={12} className="shrink-0 text-primary" />
              )}
              {tx.description}
              {hasSplits && (
                <span className="inline-flex">
                  {tx.splits!.slice(0, 4).map((s, i) => {
                    const c = s.categoryId
                      ? categories.get(s.categoryId)?.color
                      : undefined;
                    return (
                      <span
                        key={i}
                        className="h-2 w-2 rounded-full border border-surface"
                        style={{
                          backgroundColor: c ?? "#94a3b8",
                          marginLeft: i ? -3 : 0,
                        }}
                      />
                    );
                  })}
                </span>
              )}
              {tx.status === "pending" && (
                <span className="rounded-full bg-surface-2 px-1.5 py-0.5 text-[10px] text-muted">
                  pendente
                </span>
              )}
              {tx.reimbursable === 1 && (
                <span
                  className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
                  style={
                    tx.reimbursed === 1
                      ? { background: "var(--income)", color: "#04120a" }
                      : { background: "color-mix(in srgb,#f59e0b 22%,transparent)", color: "#f59e0b" }
                  }
                >
                  {tx.reimbursed === 1 ? "reembolsado" : "a reembolsar"}
                </span>
              )}
            </p>
            <p className="truncate text-xs text-muted">{subtitle}</p>
          </div>
          <div className="text-right">
            <p className={cn("text-sm font-semibold tabular", amountClass)}>
              {sign}
              {formatMoney(tx.amountCents, tx.currency)}
            </p>
            <p className="text-xs text-muted">
              {tx.endDate && tx.endDate !== tx.date
                ? `${shortDate(tx.date)}–${shortDate(tx.endDate)}`
                : formatDate(tx.date)}
            </p>
          </div>
        </button>
        {hasSplits && (
          <button
            onClick={() => setOpen((o) => !o)}
            className="shrink-0 rounded-lg p-1 text-muted hover:bg-surface-2"
            aria-label={open ? "Ocultar divisão" : "Ver divisão"}
          >
            <ChevronDown
              size={16}
              className={cn("transition-transform", open && "rotate-180")}
            />
          </button>
        )}
      </div>

      {hasSplits && open && (
        <div className="pb-2 pl-7 pr-2">
          {tx.splits!.map((s, i) => {
            const cat = s.categoryId ? categories.get(s.categoryId) : undefined;
            const c = cat?.color ?? "#94a3b8";
            const pct =
              tx.amountCents > 0 ? (s.amountCents / tx.amountCents) * 100 : 0;
            const title = s.description || cat?.name || "Sem categoria";
            const meta = [
              s.description ? (cat?.name ?? "Sem categoria") : null,
              s.quantity && s.unitAmountCents
                ? `${s.quantity} × ${formatMoney(s.unitAmountCents, tx.currency)}`
                : null,
              s.date && s.date !== tx.date ? shortDate(s.date) : null,
            ]
              .filter(Boolean)
              .join(" · ");
            return (
              <div
                key={i}
                className="split-item flex items-start gap-2.5 py-1.5"
                style={{ ["--c" as string]: c }}
              >
                <CategoryIcon icon={cat?.icon} color={c} size={26} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2 text-[13px]">
                    <span className="truncate font-medium">{title}</span>
                    <span className="shrink-0 tabular text-muted">
                      {formatMoney(s.amountCents, tx.currency)}
                    </span>
                  </div>
                  {meta && (
                    <p className="truncate text-[11px] text-muted">{meta}</p>
                  )}
                  {s.note && (
                    <p className="truncate text-[11px] italic text-muted">
                      {s.note}
                    </p>
                  )}
                  {s.tags && s.tags.length > 0 && (
                    <div className="mt-0.5 flex flex-wrap gap-1">
                      {s.tags.map((t) => (
                        <span
                          key={t}
                          className="rounded-full bg-surface-2 px-1.5 py-0.5 text-[10px] text-muted"
                        >
                          #{t}
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="mt-1 h-[5px] overflow-hidden rounded-full bg-surface-2">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${pct}%`, backgroundColor: c }}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function formatDate(date: string): string {
  const [y, m, d] = date.split("-");
  return `${d}/${m}/${y.slice(2)}`;
}

function shortDate(date: string): string {
  const [, m, d] = date.split("-");
  return `${d}/${m}`;
}
