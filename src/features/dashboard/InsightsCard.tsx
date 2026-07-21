import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { useTranslation } from "react-i18next";
import { Sparkles, RefreshCw } from "lucide-react";
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
import { getInsights } from "@/lib/aiInsights";
import { AiError } from "@/lib/ai";
import { Card, Button } from "@/components/ui/primitives";

export function InsightsCard() {
  const { t } = useTranslation();
  const accounts = useAccounts(true);
  const transactions = useAllTransactions();
  const categories = useCategories();
  const goals = useGoals();
  const budgets = useLiveQuery(async () => db.budgets.toArray(), [], []);
  const settings = useSettings();
  const sync = useSyncState();

  const [insights, setInsights] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);

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

  if (!available) return null;

  async function run() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      setInsights(await getInsights(snapshot));
      setLoaded(true);
    } catch (e) {
      const code = e instanceof AiError ? e.code : "ai_error";
      setError(t(`ai.err.${code}`, { defaultValue: t("ai.err.ai_error") }));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="anim-in mb-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Sparkles size={16} className="text-primary" />
          <h2 className="text-base font-semibold">{t("insights.title")}</h2>
        </div>
        {loaded && (
          <button
            onClick={run}
            disabled={busy}
            className="rounded-lg p-1.5 text-muted transition-colors hover:bg-surface-2 hover:text-text"
            aria-label={t("insights.refresh")}
          >
            <RefreshCw size={15} className={busy ? "animate-spin" : ""} />
          </button>
        )}
      </div>

      {!loaded && !busy && (
        <div className="mt-1">
          <p className="mb-3 text-sm text-muted">{t("insights.intro")}</p>
          <Button variant="outline" size="sm" onClick={run}>
            <Sparkles size={15} /> {t("insights.generate")}
          </Button>
        </div>
      )}

      {busy && !loaded && (
        <p className="mt-2 text-sm text-muted">{t("insights.thinking")}</p>
      )}

      {error && <p className="mt-2 text-sm text-expense">{error}</p>}

      {loaded && insights.length > 0 && (
        <ul className="mt-2 space-y-2">
          {insights.map((s, i) => (
            <li key={i} className="flex gap-2 text-sm">
              <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
              <span className="leading-relaxed">{s}</span>
            </li>
          ))}
        </ul>
      )}
      {loaded && insights.length === 0 && !error && (
        <p className="mt-2 text-sm text-muted">{t("insights.empty")}</p>
      )}
    </Card>
  );
}
