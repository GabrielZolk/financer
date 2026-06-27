import { Cloud, CloudOff, RefreshCw, AlertCircle, WifiOff } from "lucide-react";
import { useSyncState } from "@/lib/sync";
import { cn } from "@/lib/utils";

/** Indicador compacto do estado do sync (sidebar/desktop). */
export function SyncBadge() {
  const { status, pending } = useSyncState();

  const map = {
    disabled: { icon: CloudOff, text: "Local — sync desligado", cls: "text-muted" },
    signed_out: { icon: CloudOff, text: "Entre para sincronizar", cls: "text-muted" },
    idle: {
      icon: Cloud,
      text: pending > 0 ? `${pending} pendente(s)` : "Sincronizado",
      cls: "text-income",
    },
    syncing: { icon: RefreshCw, text: "Sincronizando…", cls: "text-primary" },
    offline: { icon: WifiOff, text: "Offline — salvo", cls: "text-muted" },
    error: { icon: AlertCircle, text: "Erro no sync", cls: "text-expense" },
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
