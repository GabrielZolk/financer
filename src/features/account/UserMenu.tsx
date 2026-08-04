import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  User,
  RefreshCw,
  LogOut,
  LogIn,
  Settings as SettingsIcon,
  Cloud,
} from "lucide-react";
import { useSyncState, fullSync, signOut } from "@/lib/sync";
import { getCurrentUserId } from "@/db/repo";
import { getActiveLocale } from "@/lib/i18n/config";
import { AuthDialog } from "@/features/sync/AuthDialog";
import { cn } from "@/lib/utils";

/** Iniciais a partir do e-mail: "gabriel.zolk@x.com" -> "GZ". */
function initials(email: string | null): string | null {
  if (!email) return null;
  const local = email.split("@")[0];
  const parts = local.split(/[._-]+/).filter(Boolean);
  const letters = (parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "");
  return (letters || local.slice(0, 2)).toUpperCase();
}

/**
 * Avatar do usuário com o estado do sync no PRÓPRIO anel (layout B):
 * verde = em dia, azul girando = sincronizando, âmbar = tem coisa pra subir,
 * vermelho = erro, tracejado = sem conta. Clicar abre o menu da conta.
 */
export function UserMenu() {
  const { t } = useTranslation();
  const sync = useSyncState();
  const [open, setOpen] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const signedIn = sync.status !== "signed_out" && sync.status !== "disabled";
  const pending = sync.pending > 0;

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const ring = !signedIn
    ? "border-border border-dashed"
    : sync.status === "error"
      ? "border-expense"
      : sync.status === "syncing"
        ? "border-primary"
        : sync.status === "offline"
          ? "border-border"
          : pending
            ? "border-primary"
            : "border-income";

  const statusText = !signedIn
    ? t("account.noAccount")
    : sync.status === "error"
      ? t("sync.statusError")
      : sync.status === "syncing"
        ? t("sync.statusSyncing")
        : sync.status === "offline"
          ? t("sync.statusOffline")
          : pending
            ? t("sync.pending", { count: sync.pending })
            : t("sync.statusSynced");

  const ini = initials(sync.email);

  return (
    <div className="relative" ref={wrapRef}>
      <button
        onClick={() => setOpen((v) => !v)}
        title={`${sync.email ?? t("account.noAccount")} · ${statusText}`}
        aria-label={t("account.menu")}
        aria-expanded={open}
        className={cn(
          "flex h-9 w-9 items-center justify-center rounded-full border-2 p-0.5 transition-colors",
          ring,
          sync.status === "syncing" && "animate-pulse",
        )}
      >
        <span
          className={cn(
            "flex h-full w-full items-center justify-center rounded-full text-[11px] font-bold",
            signedIn
              ? "bg-primary text-primary-fg"
              : "bg-surface-2 text-muted",
          )}
        >
          {ini ?? <User size={15} />}
        </span>
      </button>

      {open && (
        <div className="absolute right-0 top-11 z-40 w-64 rounded-2xl border border-border bg-surface p-2 shadow-xl">
          <div className="flex items-center gap-2.5 border-b border-border px-2 pb-2.5 pt-1.5">
            <span
              className={cn(
                "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[11px] font-bold",
                signedIn ? "bg-primary text-primary-fg" : "bg-surface-2 text-muted",
              )}
            >
              {ini ?? <User size={15} />}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">
                {sync.email ?? t("account.localOnly")}
              </p>
              <p className="flex items-center gap-1.5 text-xs text-muted">
                <span
                  className={cn(
                    "h-1.5 w-1.5 rounded-full",
                    !signedIn
                      ? "bg-muted"
                      : sync.status === "error"
                        ? "bg-expense"
                        : pending || sync.status === "syncing"
                          ? "bg-primary"
                          : "bg-income",
                  )}
                />
                {statusText}
              </p>
            </div>
          </div>

          {signedIn && sync.lastSyncAt && (
            <p className="px-2 pt-2 text-[11px] text-muted">
              {t("sync.lastSync")}:{" "}
              {new Date(sync.lastSyncAt).toLocaleString(getActiveLocale())}
            </p>
          )}

          <div className="mt-1 space-y-0.5">
            {signedIn ? (
              <button
                onClick={() => {
                  const uid = getCurrentUserId();
                  if (uid !== "local") void fullSync(uid);
                  setOpen(false);
                }}
                disabled={sync.status === "syncing"}
                className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-sm hover:bg-surface-2 disabled:opacity-50"
              >
                <RefreshCw
                  size={16}
                  className={cn(
                    "text-muted",
                    sync.status === "syncing" && "animate-spin",
                  )}
                />
                {t("sync.syncNow")}
              </button>
            ) : (
              <button
                onClick={() => {
                  setOpen(false);
                  setAuthOpen(true);
                }}
                className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-sm hover:bg-surface-2"
              >
                <LogIn size={16} className="text-muted" />
                {t("sync.signInCta")}
              </button>
            )}

            <Link
              to="/settings"
              onClick={() => setOpen(false)}
              className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-sm hover:bg-surface-2"
            >
              <SettingsIcon size={16} className="text-muted" />
              {t("nav.settings")}
            </Link>

            <Link
              to="/settings#dados"
              onClick={() => setOpen(false)}
              className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-sm hover:bg-surface-2"
            >
              <Cloud size={16} className="text-muted" />
              {t("account.data")}
            </Link>

            {signedIn && (
              <button
                onClick={() => {
                  setOpen(false);
                  void signOut();
                }}
                className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-sm text-expense hover:bg-surface-2"
              >
                <LogOut size={16} />
                {t("sync.signOut")}
              </button>
            )}
          </div>
        </div>
      )}

      <AuthDialog open={authOpen} onOpenChange={setAuthOpen} />
    </div>
  );
}
