import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  ArrowDownLeft,
  ArrowUpRight,
  ArrowLeftRight,
  CreditCard,
  PiggyBank,
  Sparkles,
  Camera,
  type LucideIcon,
} from "lucide-react";
import { useAccounts, useGoals, useCategories } from "@/db/hooks";
import { useSettings } from "@/lib/settings";
import { useSyncState } from "@/lib/sync";
import { parseNaturalTransaction, AiError, type AiContext } from "@/lib/ai";
import { parseReceipt } from "@/lib/aiReceipt";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button, Textarea } from "@/components/ui/primitives";
import { TransactionForm } from "@/features/transactions/TransactionForm";
import type { TransactionKind } from "@/db/types";
import { cn } from "@/lib/utils";

type Prefill = {
  kind?: TransactionKind;
  amountCents?: number;
  description?: string;
  categoryId?: string | null;
  accountId?: string | null;
  date?: string;
};

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
  const categories = useCategories();
  const goals = useGoals();
  const settings = useSettings();
  const sync = useSyncState();

  const [txOpen, setTxOpen] = useState(false);
  const [txKind, setTxKind] = useState<TransactionKind>("expense");
  const [prefill, setPrefill] = useState<Prefill | undefined>();

  const [aiOpen, setAiOpen] = useState(false);
  const [aiText, setAiText] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState("");

  const [receiptBusy, setReceiptBusy] = useState(false);
  const [receiptError, setReceiptError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const cards = accounts.filter((a) => a.type === "credit_card");
  const signedIn = sync.status === "idle" || sync.status === "syncing";
  const aiAvailable = settings.aiEnabled && signedIn;

  const buildCtx = (): AiContext => ({
    accounts: accounts.map((a) => ({ id: a.id, name: a.name })),
    categories: categories.map((c) => ({ id: c.id, name: c.name, kind: c.kind })),
    currency: settings.baseCurrency,
    today: new Date().toISOString().slice(0, 10),
  });

  async function handleReceiptFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setReceiptBusy(true);
    setReceiptError("");
    try {
      const parsed = await parseReceipt(file, buildCtx());
      setPrefill(parsed);
      setTxKind(parsed.kind);
      setReceiptBusy(false);
      setTxOpen(true);
    } catch (err) {
      const code = err instanceof AiError ? err.code : "ai_error";
      setReceiptError(t(`ai.err.${code}`, { defaultValue: t("ai.err.ai_error") }));
      setReceiptBusy(false);
    }
  }

  const openTx = (kind: TransactionKind) => {
    setPrefill(undefined);
    setTxKind(kind);
    onOpenChange(false);
    setTxOpen(true);
  };
  const go = (path: string) => {
    onOpenChange(false);
    nav(path);
  };
  const openAi = () => {
    setAiText("");
    setAiError("");
    onOpenChange(false);
    setAiOpen(true);
  };

  async function runAi() {
    const text = aiText.trim();
    if (!text || aiBusy) return;
    setAiBusy(true);
    setAiError("");
    try {
      const parsed = await parseNaturalTransaction(text, buildCtx());
      setPrefill(parsed);
      setTxKind(parsed.kind);
      setAiOpen(false);
      setTxOpen(true); // abre o form preenchido pra CONFIRMAR (nunca salva sozinho)
    } catch (e) {
      const code = e instanceof AiError ? e.code : "ai_error";
      setAiError(t(`ai.err.${code}`, { defaultValue: t("ai.err.ai_error") }));
    } finally {
      setAiBusy(false);
    }
  }

  type Item = { icon: LucideIcon; label: string; cls: string; onClick: () => void };
  const items: Item[] = [
    ...(aiAvailable
      ? [
          {
            icon: Sparkles,
            label: t("qa.aiEntry"),
            cls: "bg-primary/15 text-primary",
            onClick: openAi,
          } as Item,
          {
            icon: Camera,
            label: t("qa.receipt"),
            cls: "bg-primary/15 text-primary",
            onClick: () => {
              onOpenChange(false);
              fileRef.current?.click();
            },
          } as Item,
        ]
      : []),
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

      {/* Entrada por linguagem natural (IA) */}
      <Dialog
        open={aiOpen}
        onOpenChange={(o) => {
          if (!o) setAiText("");
          setAiOpen(o);
        }}
      >
        <DialogContent title={t("ai.title")}>
          <div className="space-y-3">
            <p className="text-sm text-muted">{t("ai.hint")}</p>
            <Textarea
              value={aiText}
              onChange={(e) => setAiText(e.target.value)}
              placeholder={t("ai.placeholder")}
              autoFocus
            />
            {aiError && <p className="text-sm text-expense">{aiError}</p>}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setAiOpen(false)}>
                {t("common.cancel")}
              </Button>
              <Button onClick={runAi} disabled={aiBusy || !aiText.trim()}>
                <Sparkles size={15} />
                {aiBusy ? t("ai.interpreting") : t("ai.interpret")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Foto de cupom — input escondido (câmera no mobile) */}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleReceiptFile}
      />
      <Dialog
        open={receiptBusy || !!receiptError}
        onOpenChange={(o) => {
          if (!o) {
            setReceiptBusy(false);
            setReceiptError("");
          }
        }}
      >
        <DialogContent title={t("qa.receipt")}>
          <div className="space-y-3 py-2 text-center">
            <Camera size={28} className="mx-auto text-primary" />
            {receiptError ? (
              <p className="text-sm text-expense">{receiptError}</p>
            ) : (
              <p className="text-sm text-muted">{t("qa.receiptReading")}</p>
            )}
            {receiptError && (
              <Button
                variant="outline"
                onClick={() => setReceiptError("")}
              >
                {t("common.close")}
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <TransactionForm
        open={txOpen}
        onOpenChange={setTxOpen}
        defaultKind={txKind}
        prefill={prefill}
      />
    </>
  );
}
