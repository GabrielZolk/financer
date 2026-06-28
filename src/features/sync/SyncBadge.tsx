import { Cloud, CloudOff, RefreshCw, AlertCircle, WifiOff } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useSyncState } from "@/lib/sync";
import { cn } from "@/lib/utils";

/** Indicador compacto do estado do sync (sidebar/desktop). */
export function SyncBadge() {
  const { status, pending } = useSyncState();
  const { t } = useTranslation();

  const map = {
    disabled: { icon: CloudOff, text: t("sync.badgeLocal"), cls: "text-muted" },
    signed_out: {
      icon: CloudOff,
      text: t("sync.badgeSignIn"),
      cls: "text-muted",
    },
    idle: {
      icon: Cloud,
      text:
        pending > 0
          ? t("sync.pending", { count: pending })
          : t("sync.statusSynced"),
      cls: "text-income",
    },
    syncing: {
      icon: RefreshCw,
      text: t("sync.badgeSyncing"),
      cls: "text-primary",
    },
    offline: { icon: WifiOff, text: t("sync.badgeOffline"), cls: "text-muted" },
    error: { icon: AlertCircle, text: t("sync.statusError"), cls: "text-expense" },
  } as const;

  const { icon: Icon, text, cls } = map[status];

  return (
    <div className="flex items-center gap-2 rounded-xl bg-surface-2 px-3 py-2 text-xs">
      <Icon
        size={14}
        className={cn(cls, status === "syncing" && "animate-spin")}
      />
      <span className={cls}>{text}</span>
    </div>
  );
}
