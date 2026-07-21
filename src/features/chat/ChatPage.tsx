import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { useTranslation } from "react-i18next";
import { Sparkles, ArrowUp, Settings as SettingsIcon } from "lucide-react";
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
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/primitives";
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

  const [messages, setMessages] = useState<ChatMsg[]>(() => {
    try {
      return JSON.parse(localStorage.getItem("fin.chat") || "[]") as ChatMsg[];
    } catch {
      return [];
    }
  });
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  // persiste a conversa (só quando não está streamando, pra não salvar parcial)
  useEffect(() => {
    if (!busy) {
      try {
        localStorage.setItem("fin.chat", JSON.stringify(messages.slice(-40)));
      } catch {
        /* ignore */
      }
    }
  }, [messages, busy]);

  function newChat() {
    setMessages([]);
    setError("");
    try {
      localStorage.removeItem("fin.chat");
    } catch {
      /* ignore */
    }
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

  async function send(text: string) {
    const q = text.trim();
    if (!q || busy) return;
    setError("");
    const base = [...messages, { role: "user" as const, content: q }];
    // adiciona a bolha do usuário + uma bolha vazia do assistente (streaming)
    setMessages([...base, { role: "assistant", content: "" }]);
    setInput("");
    setBusy(true);
    try {
      await askAssistant(base, snapshot, (full) => {
        setMessages((m) => {
          const copy = m.slice();
          copy[copy.length - 1] = { role: "assistant", content: full };
          return copy;
        });
      });
    } catch (e) {
      const code = e instanceof AiError ? e.code : "ai_error";
      setMessages((m) => m.slice(0, -1)); // tira a bolha vazia do assistente
      setError(t(`ai.err.${code}`, { defaultValue: t("ai.err.ai_error") }));
    } finally {
      setBusy(false);
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

  return (
    <div className="flex min-h-[calc(100vh-9rem)] flex-col">
      <PageHeader
        title={t("chat.title")}
        subtitle={t("chat.subtitle")}
        action={
          messages.length > 0 ? (
            <Button variant="ghost" size="sm" onClick={newChat}>
              {t("chat.newChat")}
            </Button>
          ) : undefined
        }
      />

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
    </div>
  );
}
