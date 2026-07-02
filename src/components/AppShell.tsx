import { useState } from "react";
import { NavLink, Link, Outlet, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  LayoutDashboard,
  ArrowLeftRight,
  Wallet,
  PiggyBank,
  Target,
  BarChart3,
  Settings,
  MoreHorizontal,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { SyncBadge } from "@/features/sync/SyncBadge";
import { FeitoOverlay } from "@/components/feedback/Feito";
import { PrivacyControl } from "@/features/privacy/PrivacyControl";
import { FeedbackButton } from "@/features/feedback/FeedbackButton";

const NAV: { to: string; key: string; icon: LucideIcon; end?: boolean }[] = [
  { to: "/", key: "nav.home", icon: LayoutDashboard, end: true },
  { to: "/transactions", key: "nav.transactions", icon: ArrowLeftRight },
  { to: "/accounts", key: "nav.accounts", icon: Wallet },
  { to: "/budget", key: "nav.budget", icon: PiggyBank },
  { to: "/goals", key: "nav.goals", icon: Target },
  { to: "/reports", key: "nav.reports", icon: BarChart3 },
  { to: "/settings", key: "nav.settings", icon: Settings },
];

// Abas fixas na barra inferior (mobile); o resto vai pro painel "Mais".
const PRIMARY = ["/", "/transactions", "/accounts", "/reports"];
const MOBILE_NAV = NAV.filter((n) => PRIMARY.includes(n.to));
const MORE_NAV = NAV.filter((n) => !PRIMARY.includes(n.to));

export function AppShell() {
  const { t } = useTranslation();
  const location = useLocation();
  const [moreOpen, setMoreOpen] = useState(false);

  // "Mais" fica ativo quando a rota atual é uma das telas do painel
  const moreActive = MORE_NAV.some((n) => location.pathname === n.to);

  return (
    <div className="flex min-h-full bg-bg">
      {/* Sidebar (desktop) */}
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-border bg-surface px-3 py-5 md:flex">
        <div className="mb-6 flex items-center gap-2 px-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-fg">
            <Wallet size={18} />
          </div>
          <span className="text-lg font-semibold">Financer</span>
        </div>
        <nav className="flex flex-1 flex-col gap-1">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-primary/10 text-primary"
                    : "text-muted hover:bg-surface-2 hover:text-text",
                )
              }
            >
              <item.icon size={18} />
              {t(item.key)}
            </NavLink>
          ))}
        </nav>
        <div className="px-2">
          <SyncBadge />
        </div>
      </aside>

      {/* Conteúdo */}
      <main className="flex min-w-0 flex-1 flex-col">
        <div className="mx-auto w-full max-w-3xl flex-1 px-4 pb-24 pt-3 md:pb-8">
          <div className="mb-2 flex items-center justify-end gap-2">
            <FeedbackButton />
            <PrivacyControl />
          </div>
          <Outlet />
        </div>
      </main>

      {/* Painel "Mais" (mobile) — bottom sheet */}
      {moreOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm md:hidden"
          onClick={() => setMoreOpen(false)}
        >
          <div
            className="absolute inset-x-0 bottom-0 rounded-t-2xl border-t border-border bg-surface p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-border" />
            <div className="grid grid-cols-3 gap-2">
              {MORE_NAV.map((item) => {
                const active = location.pathname === item.to;
                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    onClick={() => setMoreOpen(false)}
                    className={cn(
                      "flex flex-col items-center gap-1.5 rounded-xl border py-4 text-xs font-medium transition-colors",
                      active
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border text-muted hover:bg-surface-2 hover:text-text",
                    )}
                  >
                    <item.icon size={22} />
                    {t(item.key)}
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Bottom nav (mobile) */}
      <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-border bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
        {MOBILE_NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            onClick={() => setMoreOpen(false)}
            className={({ isActive }) =>
              cn(
                "flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium",
                isActive && !moreOpen ? "text-primary" : "text-muted",
              )
            }
          >
            <item.icon size={20} />
            {t(item.key)}
          </NavLink>
        ))}
        <button
          onClick={() => setMoreOpen((v) => !v)}
          className={cn(
            "flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium",
            moreActive || moreOpen ? "text-primary" : "text-muted",
          )}
          aria-label={t("nav.more")}
        >
          <MoreHorizontal size={20} />
          {t("nav.more")}
        </button>
      </nav>

      <FeitoOverlay />
    </div>
  );
}
