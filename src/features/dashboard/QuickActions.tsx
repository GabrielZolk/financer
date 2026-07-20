import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  ArrowDownLeft,
  ArrowUpRight,
  ArrowLeftRight,
  CreditCard,
  PiggyBank,
  type LucideIcon,
} from "lucide-react";
import { useAccounts, useGoals } from "@/db/hooks";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { TransactionForm } from "@/features/transactions/TransactionForm";
import type { TransactionKind } from "@/db/types";
import { cn } from "@/lib/utils";

/**
 * Hub de ações: o "+" abre um menu com as ações nomeadas (registrar despesa /
 * receita, transferir, pagar cartão, guardar numa meta) em vez de expor o
 * formulário genérico com "tipo". Esconde a mecânica contábil.
 */
export function QuickActions({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const { t } = useTranslation();
  const nav = useNavigate();
  const accounts = useAccounts(true);
  const goals = useGoals();
  const [txOpen, setTxOpen] = useState(false);
  const [txKind, setTxKind] = useState<TransactionKind>("expense");

  const cards = accounts.filter((a) => a.type === "credit_card");

  const openTx = (kind: TransactionKind) => {
    setTxKind(kind);
    onOpenChange(false);
    setTxOpen(true);
  };
  const go = (path: string) => {
    onOpenChange(false);
    nav(path);
  };

  type Item = { icon: LucideIcon; label: string; cls: string; onClick: () => void };
  const items: Item[] = [
    {
      icon: ArrowDownLeft,
      label: t("qa.expense"),
      cls: "bg-expense/15 text-expense",
      onClick: () => openTx("expense"),
    },
    {
      icon: ArrowUpRight,
      label: t("qa.income"),
      cls: "bg-income/15 text-income",
      onClick: () => openTx("income"),
    },
    {
      icon: ArrowLeftRight,
      label: t("qa.transfer"),
      cls: "bg-primary/15 text-primary",
      onClick: () => openTx("transfer"),
    },
    ...(cards.length
      ? [
          {
            icon: CreditCard,
            label: t("qa.payCard"),
            cls: "bg-surface-2 text-muted",
            onClick: () =>
              go(cards.length === 1 ? `/cards/${cards[0].id}` : "/accounts"),
          } as Item,
        ]
      : []),
    ...(goals.length
      ? [
          {
            icon: PiggyBank,
            label: t("qa.saveGoal"),
            cls: "bg-surface-2 text-muted",
            onClick: () => go("/goals"),
          } as Item,
        ]
      : []),
  ];

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent title={t("qa.title")}>
          <div className="space-y-1">
            {items.map((it) => (
              <button
                key={it.label}
                onClick={it.onClick}
                className="flex w-full items-center gap-3 rounded-xl p-2.5 text-left transition-colors hover:bg-surface-2"
              >
                <span
                  className={cn(
                    "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl",
                    it.cls,
                  )}
                >
                  <it.icon size={18} />
                </span>
                <span className="text-sm font-medium">{it.label}</span>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
      <TransactionForm
        open={txOpen}
        onOpenChange={setTxOpen}
        defaultKind={txKind}
      />
    </>
  );
}
