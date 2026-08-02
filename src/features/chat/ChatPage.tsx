import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { useTranslation } from "react-i18next";
import {
  Sparkles,
  ArrowUp,
  Settings as SettingsIcon,
  MessagesSquare,
  Plus,
  Trash2,
  Target,
  Wallet,
  ArrowDownLeft,
  Check,
  X,
} from "lucide-react";
import { db } from "@/db/schema";
import {
  useAccounts,
  useAllTransactions,
  useCategories,
  useGoals,
} from "@/db/hooks";
import { useSettings } from "@/lib/settings";
import { useSyncState } from "@/lib/sync";
import { buildSnapshot } from "@/lib/aiSnapshot";
import { askAssistant, type ChatMsg } from "@/lib/aiChat";
import { AiError } from "@/lib/ai";
import {
  listConversations,
  saveConversation,
  deleteConversation,
  newId,
} from "@/lib/chatStore";
import {
  applyAction,
  type ActionCtx,
  type ChatAction,
} from "@/lib/aiActions";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/primitives";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { TransactionForm } from "@/features/transactions/TransactionForm";
import { formatDate } from "@/lib/format";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";

export function ChatPage() {
  const { t } = useTranslation();
  const accounts = useAccounts(true);
  const transactions = useAllTransactions();
  const categories = useCategories();
  const goals = useGoals();
  const budgets = useLiveQuery(async () => db.budgets.toArray(), [], []);
  const settings = useSettings();
  const sync = useSyncState();

  const initial = useMemo(() => listConversations()[0], []);
  const [activeId, setActiveId] = useState<string>(() => initial?.id ?? newId());
  const [messages, setMessages] = useState<ChatMsg[]>(
    () => initial?.messages ?? [],
  );
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [convOpen, setConvOpen] = useState(false);
  const [convVersion, setConvVersion] = useState(0);
  const [pending, setPending] = useState<ChatAction | null>(null);
  const [applying, setApplying] = useState(false);
  const [txOpen, setTxOpen] = useState(false);
  const [txPrefill, setTxPrefill] = useState<
    Extract<ChatAction, { type: "transaction" }> | null
  >(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // salva a conversa ativa (só quando não está streamando, pra não salvar parcial)
  useEffect(() => {
    if (!busy && messages.length) {
      saveConversation(activeId, messages);
      setConvVersion((v) => v + 1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, busy]);

  const conversations = useMemo(
    () => listConversations(),
    // reavalia ao abrir a lista ou após salvar/apagar
    [convOpen, convVersion],
  );

  function newChat() {
    setActiveId(newId());
    setMessages([]);
    setError("");
    setPending(null);
    setConvOpen(false);
  }
  function openConversation(id: string) {
    const c = listConversations().find((x) => x.id === id);
    if (c) {
      setActiveId(c.id);
      setMessages(c.messages);
      setError("");
      setPending(null);
    }
    setConvOpen(false);
  }
  function removeConversation(id: string) {
    deleteConversation(id);
    setConvVersion((v) => v + 1);
    if (id === activeId) newChat();
  }

  const signedIn = sync.status === "idle" || sync.status === "syncing";
  const available = settings.aiEnabled && signedIn;

  const snapshot = useMemo(
    () =>
      buildSnapshot(
        accounts,
        transactions,
        categories,
        goals,
        budgets,
        settings.baseCurrency,
      ),
    [accounts, transactions, categories, goals, budgets, settings.baseCurrency],
  );

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, busy]);

  const actionCtx: ActionCtx = useMemo(
    () => ({
      accounts: accounts.map((a) => ({
        id: a.id,
        name: a.name,
        archived: a.archived,
      })),
      categories: categories.map((c) => ({
        id: c.id,
        name: c.name,
        kind: c.kind,
      })),
      today: new Date().toISOString().slice(0, 10),
    }),
    [accounts, categories],
  );

  async function send(text: string) {
    const q = text.trim();
    if (!q || busy) return;
    setError("");
    setPending(null);
    const base = [...messages, { role: "user" as const, content: q }];
    // adiciona a bolha do usuário + uma bolha vazia do assistente (streaming)
    setMessages([...base, { role: "assistant", content: "" }]);
    setInput("");
    setBusy(true);
    try {
      const answer = await askAssistant(
        base,
        snapshot,
        (full) => {
          setMessages((m) => {
            const copy = m.slice();
            copy[copy.length - 1] = { role: "assistant", content: full };
            return copy;
          });
        },
        actionCtx,
      );
      if (answer.action) {
        // se o modelo só chamou a ferramenta (sem texto), põe uma frase-guia
        if (!answer.text.trim()) {
          setMessages((m) => {
            const copy = m.slice();
            copy[copy.length - 1] = {
              role: "assistant",
              content: t("chat.actionIntro"),
            };
            return copy;
          });
        }
        setPending(answer.action);
      }
    } catch (e) {
      const code = e instanceof AiError ? e.code : "ai_error";
      setMessages((m) => m.slice(0, -1)); // tira a bolha vazia do assistente
      setError(t(`ai.err.${code}`, { defaultValue: t("ai.err.ai_error") }));
    } finally {
      setBusy(false);
    }
  }

  /** Confirma a ação proposta. Lançamento abre o formulário; o resto grava. */
  async function confirmAction() {
    if (!pending || applying) return;
    if (pending.type === "transaction") {
      setTxPrefill(pending);
      setPending(null);
      setTxOpen(true);
      return;
    }
    setApplying(true);
    try {
      await applyAction(pending);
      const done =
        pending.type === "goal"
          ? t("chat.goalCreated", { name: pending.name })
          : t("chat.budgetCreated", { name: pending.categoryName });
      setMessages((m) => [...m, { role: "assistant", content: done }]);
      setPending(null);
    } catch {
      setError(t("chat.actionFailed"));
    } finally {
      setApplying(false);
    }
  }

  if (!available) {
    return (
      <div>
        <PageHeader title={t("chat.title")} />
        <div className="rounded-2xl border border-border bg-surface p-6 text-center">
          <Sparkles size={28} className="mx-auto mb-3 text-primary" />
          <p className="mb-1 font-medium">
            {signedIn ? t("chat.disabledTitle") : t("chat.needLoginTitle")}
          </p>
          <p className="mb-4 text-sm text-muted">
            {signedIn ? t("chat.disabledDesc") : t("chat.needLoginDesc")}
          </p>
          <Link to="/settings">
            <Button variant="outline">
              <SettingsIcon size={16} /> {t("nav.settings")}
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  const suggestions = t("chat.suggestions", { returnObjects: true }) as string[];

  const cur = settings.baseCurrency;
  const actionCard = (() => {
    if (!pending) return null;
    if (pending.type === "goal")
      return {
        icon: Target,
        title: t("chat.act.goal", { name: pending.name }),
        detail:
          formatMoney(pending.targetCents, cur) +
          (pending.deadline ? ` · ${formatDate(pending.deadline)}` : ""),
        cta: t("chat.act.goalCta"),
      };
    if (pending.type === "budget")
      return {
        icon: Wallet,
        title: t("chat.act.budget", { name: pending.categoryName }),
        detail: t("chat.act.budgetDetail", {
          value: formatMoney(pending.limitCents, cur),
        }),
        cta: t("chat.act.budgetCta"),
      };
    const catName = categories.find((c) => c.id === pending.categoryId)?.name;
    const accName = accounts.find((a) => a.id === pending.accountId)?.name;
    return {
      icon: ArrowDownLeft,
      title: `${pending.description || t("chat.act.tx")} · ${formatMoney(pending.amountCents, cur)}`,
      detail: [formatDate(pending.date), catName, accName]
        .filter(Boolean)
        .join(" · "),
      cta: t("chat.act.txCta"),
    };
  })();

  return (
    <div className="flex min-h-[calc(100vh-9rem)] flex-col">
      <PageHeader
        title={t("chat.title")}
        subtitle={t("chat.subtitle")}
        action={
          <div className="flex gap-1">
            <Button variant="ghost" size="sm" onClick={() => setConvOpen(true)}>
              <MessagesSquare size={16} /> {t("chat.conversations")}
            </Button>
            <Button variant="ghost" size="icon" onClick={newChat} aria-label={t("chat.newChat")}>
              <Plus size={18} />
            </Button>
          </div>
        }
      />

      <Dialog open={convOpen} onOpenChange={setConvOpen}>
        <DialogContent title={t("chat.conversations")}>
          <div className="space-y-2">
            <Button className="w-full" variant="outline" onClick={newChat}>
              <Plus size={16} /> {t("chat.newChat")}
            </Button>
            {conversations.length === 0 ? (
              <p className="py-2 text-center text-sm text-muted">
                {t("chat.noConversations")}
              </p>
            ) : (
              <div className="max-h-72 space-y-1 overflow-y-auto">
                {conversations.map((c) => (
                  <div
                    key={c.id}
                    className={cn(
                      "flex items-center gap-2 rounded-xl border p-2.5",
                      c.id === activeId
                        ? "border-primary bg-primary/5"
                        : "border-border",
                    )}
                  >
                    <button
                      onClick={() => openConversation(c.id)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <p className="truncate text-sm font-medium">{c.title}</p>
                      <p className="text-xs text-muted">
                        {formatDate(new Date(c.updatedAt).toISOString().slice(0, 10))}
                      </p>
                    </button>
                    <button
                      onClick={() => removeConversation(c.id)}
                      className="rounded-lg p-1.5 text-muted hover:bg-surface-2 hover:text-expense"
                      aria-label={t("common.delete")}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto pb-2">
        {messages.length === 0 ? (
          <div className="pt-6 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <Sparkles size={22} />
            </div>
            <p className="mb-4 text-sm text-muted">{t("chat.greeting")}</p>
            <div className="flex flex-wrap justify-center gap-2">
              {suggestions.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="rounded-full border border-border px-3 py-1.5 text-xs font-medium text-muted transition-colors hover:border-primary hover:text-text"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((m, i) => (
            <div
              key={i}
              className={cn(
                "flex",
                m.role === "user" ? "justify-end" : "justify-start",
              )}
            >
              <div
                className={cn(
                  "max-w-[85%] whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed",
                  m.role === "user"
                    ? "rounded-br-md bg-primary text-primary-fg"
                    : "rounded-bl-md bg-surface-2 text-text",
                )}
              >
                {m.content ||
                  (m.role === "assistant" && busy ? (
                    <span className="text-muted">{t("chat.thinking")}</span>
                  ) : (
                    ""
                  ))}
              </div>
            </div>
          ))
        )}
        {actionCard && (
          <div className="rounded-2xl border border-primary/40 bg-primary/5 p-3.5">
            <div className="mb-1.5 flex items-center gap-1.5 text-primary">
              <actionCard.icon size={15} />
              <p className="text-[11px] font-semibold uppercase tracking-wide">
                {t("chat.act.label")}
              </p>
            </div>
            <p className="font-medium">{actionCard.title}</p>
            {actionCard.detail && (
              <p className="text-sm text-muted">{actionCard.detail}</p>
            )}
            <div className="mt-3 flex gap-2">
              <Button size="sm" onClick={confirmAction} disabled={applying}>
                <Check size={16} /> {actionCard.cta}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setPending(null)}
                disabled={applying}
              >
                <X size={16} /> {t("common.cancel")}
              </Button>
            </div>
          </div>
        )}
        {error && <p className="text-center text-sm text-expense">{error}</p>}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send(input);
        }}
        className="sticky bottom-0 mt-2 flex items-end gap-2 bg-bg/80 py-2 backdrop-blur"
      >
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send(input);
            }
          }}
          rows={1}
          placeholder={t("chat.placeholder")}
          className="max-h-32 min-h-[44px] flex-1 resize-none rounded-2xl border border-border bg-surface px-4 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
        />
        <button
          type="submit"
          disabled={busy || !input.trim()}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary text-primary-fg transition-opacity disabled:opacity-40"
          aria-label={t("chat.send")}
        >
          <ArrowUp size={20} />
        </button>
      </form>

      <TransactionForm
        open={txOpen}
        onOpenChange={setTxOpen}
        defaultKind={txPrefill?.kind ?? "expense"}
        prefill={txPrefill ?? undefined}
      />
    </div>
  );
}
