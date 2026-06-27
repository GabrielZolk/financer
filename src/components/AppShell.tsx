import { NavLink, Outlet } from "react-router-dom";
import {
  LayoutDashboard,
  ArrowLeftRight,
  Wallet,
  PiggyBank,
  Target,
  BarChart3,
  Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { SyncBadge } from "@/features/sync/SyncBadge";
import { FeitoOverlay } from "@/components/feedback/Feito";
import { PrivacyControl } from "@/features/privacy/PrivacyControl";
import { FeedbackButton } from "@/features/feedback/FeedbackButton";

const NAV = [
  { to: "/", label: "Início", icon: LayoutDashboard, end: true },
  { to: "/transactions", label: "Lançamentos", icon: ArrowLeftRight },
  { to: "/accounts", label: "Contas", icon: Wallet },
  { to: "/budget", label: "Orçamento", icon: PiggyBank },
  { to: "/goals", label: "Metas", icon: Target },
  { to: "/reports", label: "Relatórios", icon: BarChart3 },
  { to: "/settings", label: "Ajustes", icon: Settings },
];

// Itens prioritários na barra inferior (mobile)
const MOBILE_NAV = NAV.filter((n) =>
  ["/", "/transactions", "/accounts", "/reports"].includes(n.to),
);

export function AppShell() {
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
              {item.label}
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

      {/* Bottom nav (mobile) */}
      <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-border bg-surface/95 backdrop-blur md:hidden">
        {MOBILE_NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              cn(
                "flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium",
                isActive ? "text-primary" : "text-muted",
              )
            }
          >
            <item.icon size={20} />
            {item.label}
          </NavLink>
        ))}
      </nav>

      <FeitoOverlay />
    </div>
  );
}
