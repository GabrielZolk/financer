import { useState } from "react";
import { Cloud, RefreshCw, LogOut } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button, Card } from "@/components/ui/primitives";
import { isSupabaseConfigured } from "@/lib/supabase";
import { useSyncState, fullSync, signOut } from "@/lib/sync";
import { getCurrentUserId } from "@/db/repo";
import { getActiveLocale } from "@/lib/i18n/config";
import { AuthDialog } from "./AuthDialog";

export function SyncCard() {
  const sync = useSyncState();
  const { t } = useTranslation();
  const [authOpen, setAuthOpen] = useState(false);

  const statusLabel = (s: string): string =>
    ({
      idle: t("sync.statusSynced"),
      syncing: t("sync.statusSyncing"),
      offline: t("sync.statusOffline"),
      error: t("sync.statusError"),
    })[s] ?? s;

  return (
    <Card>
      <div className="flex items-center gap-2">
        <Cloud size={18} className="text-muted" />
        <h2 className="text-base font-semibold">{t("sync.title")}</h2>
      </div>

      {!isSupabaseConfigured ? (
        <p className="mt-1 text-sm text-muted">{t("sync.notConfigured")}</p>
      ) : sync.status === "signed_out" ? (
        <>
          <p className="mb-3 mt-1 text-sm text-muted">{t("sync.subtitle")}</p>
          <Button onClick={() => setAuthOpen(true)}>
            {t("sync.signInCta")}
          </Button>
        </>
      ) : (
        <>
          <div className="mb-3 mt-1 space-y-0.5 text-sm">
            <p className="text-muted">
              {t("sync.account")}:{" "}
              <span className="text-text">{sync.email}</span>
            </p>
            <p className="text-muted">
              {t("sync.status")}:{" "}
              <span className="text-text">{statusLabel(sync.status)}</span>
              {sync.pending > 0 &&
                ` · ${t("sync.pending", { count: sync.pending })}`}
            </p>
            {sync.lastSyncAt && (
              <p className="text-muted">
                {t("sync.lastSync")}:{" "}
                {new Date(sync.lastSyncAt).toLocaleString(getActiveLocale())}
              </p>
            )}
            {sync.error && <p className="text-expense">{sync.error}</p>}
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => {
                const uid = getCurrentUserId();
                if (uid !== "local") void fullSync(uid);
              }}
              disabled={sync.status === "syncing"}
            >
              <RefreshCw
                size={16}
                className={sync.status === "syncing" ? "animate-spin" : ""}
              />
              {t("sync.syncNow")}
            </Button>
            <Button variant="ghost" onClick={() => void signOut()}>
              <LogOut size={16} /> {t("sync.signOut")}
            </Button>
          </div>
        </>
      )}

      <AuthDialog open={authOpen} onOpenChange={setAuthOpen} />
    </Card>
  );
}
