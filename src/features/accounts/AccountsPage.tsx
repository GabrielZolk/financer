import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import {
  Plus,
  Wallet,
  CreditCard,
  Landmark,
  PiggyBank,
  TrendingUp,
} from "lucide-react";
import { useAccounts, useAllTransactions } from "@/db/hooks";
import { balancesByAccount, currentInvoice } from "@/lib/calc";
import { formatMoney, formatSigned } from "@/lib/money";
import { formatDayMonth } from "@/lib/format";
import { useSettings, makeRateFn } from "@/lib/settings";
import { Button, Card, EmptyState } from "@/components/ui/primitives";
import { PageHeader } from "@/components/PageHeader";
import { AccountForm } from "./AccountForm";
import type { Account, AccountType, Transaction } from "@/db/types";

const ICONS: Record<AccountType, typeof Wallet> = {
  cash: Wallet,
  checking: Landmark,
  savings: PiggyBank,
  credit_card: CreditCard,
  investment: TrendingUp,
};

function dayMonth(iso: string): string {
  return formatDayMonth(iso).replace(".", "");
}
function nextDayMonth(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + 1);
  return formatDayMonth(d).replace(".", "");
}

export function AccountsPage() {
  const { t } = useTranslation();
  const accounts = useAccounts(true);
  const transactions = useAllTransactions();
  const settings = useSettings();
  const rate = useMemo(
    () => makeRateFn(settings.baseCurrency, settings.rates),
    [settings.baseCurrency, settings.rates],
  );
  const balances = useMemo(
    () => balancesByAccount(accounts, transactions),
    [accounts, transactions],
  );

  const navigate = useNavigate();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Account | undefined>();

  const contas = accounts.filter((a) => a.type !== "credit_card");
  const cards = accounts.filter((a) => a.type === "credit_card");

  // patrimônio líquido = contas + saldo dos cartões (negativo = dívida),
  // convertendo cada conta pra moeda base pela cotação
  const { contasTotal, cardSum } = useMemo(() => {
    let contasTotal = 0;
    let cardSum = 0;
    for (const acc of accounts) {
      if (acc.archived) continue;
      const b = balances.get(acc.id) ?? 0;
      const factor = acc.currency === settings.baseCurrency ? 1 : rate(acc.currency);
      const conv = Math.round(b * factor);
      if (acc.type === "credit_card") cardSum += conv;
      else contasTotal += conv;
    }
    return { contasTotal, cardSum };
  }, [accounts, balances, settings.baseCurrency, rate]);
  const liquido = contasTotal + cardSum;

  function openNew() {
    setEditing(undefined);
    setFormOpen(true);
  }

  return (
    <div>
      <PageHeader
        title={t("acc.title")}
        action={
          <Button onClick={openNew}>
            <Plus size={18} /> {t("acc.new")}
          </Button>
        }
      />

      {accounts.length === 0 ? (
        <EmptyState
          title={t("acc.emptyTitle")}
          description={t("acc.emptyDesc")}
          action={
            <Button onClick={openNew}>
              <Plus size={18} /> {t("acc.newAccount")}
            </Button>
          }
        />
      ) : (
        <>
          {/* Patrimônio líquido */}
          <Card className="anim-in mb-4">
            <p className="text-xs text-muted">{t("acc.netWorth")}</p>
            <p
              className="text-2xl font-extrabold tabular"
              style={{ color: liquido < 0 ? "var(--expense)" : undefined }}
            >
              {formatMoney(liquido, settings.baseCurrency)}
            </p>
            <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-xs">
              <span className="text-muted">
                {t("acc.inAccounts")}
                <b className="block text-sm text-income">
                  {formatMoney(contasTotal, settings.baseCurrency)}
                </b>
              </span>
              {cards.length > 0 && (
                <span className="text-muted">
                  {cardSum < 0 ? t("acc.cardDebt") : t("acc.cards")}
                  <b
                    className="block text-sm"
                    style={{ color: cardSum < 0 ? "var(--expense)" : "var(--income)" }}
                  >
                    {formatSigned(cardSum, settings.baseCurrency)}
                  </b>
                </span>
              )}
            </div>
          </Card>

          {/* Contas */}
          {contas.length > 0 && (
            <>
              <SectionLabel>{t("acc.sectionAccounts")}</SectionLabel>
              <div className="grid gap-3 sm:grid-cols-2">
                {contas.map((acc, i) => (
                  <AccountCard
                    key={acc.id}
                    acc={acc}
                    balance={balances.get(acc.id) ?? 0}
                    delay={i}
                    t={t}
                    onClick={() => {
                      setEditing(acc);
                      setFormOpen(true);
                    }}
                  />
                ))}
              </div>
            </>
          )}

          {/* Cartões */}
          {cards.length > 0 && (
            <>
              <SectionLabel>{t("acc.sectionCards")}</SectionLabel>
              <div className="space-y-3">
                {cards.map((acc, i) => (
                  <CreditCardVisual
                    key={acc.id}
                    acc={acc}
                    transactions={transactions}
                    delay={i}
                    t={t}
                    onClick={() => navigate(`/cards/${acc.id}`)}
                  />
                ))}
              </div>
            </>
          )}
        </>
      )}

      <AccountForm
        open={formOpen}
        onOpenChange={setFormOpen}
        editing={editing}
        currentBalance={editing ? balances.get(editing.id) : undefined}
      />
    </div>
  );
}

function SectionLabel({ children }: { children: string }) {
  return (
    <h2 className="mb-2 mt-5 px-0.5 text-xs font-semibold uppercase tracking-wide text-muted">
      {children}
    </h2>
  );
}

function AccountCard({
  acc,
  balance,
  delay,
  t,
  onClick,
}: {
  acc: Account;
  balance: number;
  delay: number;
  t: TFunction;
  onClick: () => void;
}) {
  const Icon = ICONS[acc.type];
  return (
    <Card
      className="anim-in cursor-pointer transition-shadow hover:shadow-md"
      style={{ animationDelay: `${Math.min(delay * 55, 300)}ms` }}
      onClick={onClick}
    >
      <div className="flex items-start justify-between">
        <span
          className="flex h-10 w-10 items-center justify-center rounded-xl"
          style={{ backgroundColor: `${acc.color}22`, color: acc.color }}
        >
          <Icon size={20} />
        </span>
        {acc.archived ? (
          <span className="text-xs text-muted">{t("acc.archived")}</span>
        ) : null}
      </div>
      <p className="mt-3 text-sm text-muted">{acc.name}</p>
      <p
        className="text-xl font-bold tabular"
        style={{ color: balance < 0 ? "var(--expense)" : undefined }}
      >
        {formatMoney(balance, acc.currency)}
      </p>
    </Card>
  );
}

function CreditCardVisual({
  acc,
  transactions,
  delay,
  t,
  onClick,
}: {
  acc: Account;
  transactions: Transaction[];
  delay: number;
  t: TFunction;
  onClick: () => void;
}) {
  const inv = currentInvoice(acc, transactions);
  const fatura = inv?.totalCents ?? 0;
  const limit = acc.creditLimitCents ?? 0;
  const disponivel = limit ? Math.max(limit - fatura, 0) : null;
  const usagePct = limit ? Math.min(Math.round((fatura / limit) * 100), 100) : null;
  const last4 = acc.cardLast4 || "••••";

  return (
    <button
      type="button"
      onClick={onClick}
      className="anim-in block w-full rounded-2xl p-4 text-left text-white transition-transform hover:-translate-y-0.5"
      style={{
        animationDelay: `${Math.min(delay * 55, 300)}ms`,
        background: acc.color,
        backgroundImage:
          "linear-gradient(135deg, rgba(255,255,255,.14), rgba(0,0,0,.30))",
      }}
    >
      <div className="flex items-center justify-between">
        <span className="h-5 w-7 rounded bg-white/35" />
        <span className="inline-flex items-center gap-1.5 font-bold tracking-wide">
          <CreditCard size={16} /> {acc.name}
        </span>
      </div>
      <p className="my-3 font-mono tracking-widest text-white/85">
        •••• •••• •••• {last4}
      </p>
      <div className="flex items-end justify-between">
        <div>
          <p className="text-[10px] uppercase tracking-wide text-white/75">
            {t("acc.openInvoice")}
          </p>
          <p className="text-lg font-extrabold tabular">
            {formatMoney(fatura, acc.currency)}
          </p>
        </div>
        {disponivel !== null && (
          <div className="text-right">
            <p className="text-[10px] uppercase tracking-wide text-white/75">
              {t("acc.available")}
            </p>
            <p className="text-lg font-extrabold tabular">
              {formatMoney(disponivel, acc.currency)}
            </p>
          </div>
        )}
      </div>
      {usagePct !== null && (
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-black/25">
          <div
            className="h-full rounded-full bg-white/90"
            style={{ width: `${usagePct}%` }}
          />
        </div>
      )}
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-0.5 text-[10.5px] text-white/80">
        {inv && <span>{t("acc.dueOn", { date: dayMonth(inv.dueDate) })}</span>}
        {inv && <span>·</span>}
        {inv && (
          <span>{t("acc.bestDay", { date: nextDayMonth(inv.closeDate) })}</span>
        )}
        {limit ? (
          <>
            <span>·</span>
            <span>
              {t("acc.cardLimitLine", {
                value: formatMoney(limit, acc.currency),
              })}
              {usagePct !== null ? t("acc.cardUsed", { pct: usagePct }) : ""}
            </span>
          </>
        ) : null}
        {!inv && !limit && <span>{t("acc.cardSetupHint")}</span>}
      </div>
    </button>
  );
}
