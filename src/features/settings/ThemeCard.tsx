import { useTranslation } from "react-i18next";
import { Check } from "lucide-react";
import { Card } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";
import { useSettings, setSetting, applyPalette } from "@/lib/settings";

/** Cores de PREVIEW (variante escura) de cada paleta — só pro mini-preview. */
const THEMES: {
  id: string;
  nameKey: string;
  bg: string;
  surface: string;
  accent: string;
}[] = [
  { id: "indigo", nameKey: "theme.indigo", bg: "#0b0f1a", surface: "#121829", accent: "#6366f1" },
  { id: "emerald", nameKey: "theme.emerald", bg: "#08130f", surface: "#102420", accent: "#10b981" },
  { id: "ocean", nameKey: "theme.ocean", bg: "#08111b", surface: "#0f1f2e", accent: "#38bdf8" },
  { id: "violet", nameKey: "theme.violet", bg: "#0f0a1a", surface: "#1c1430", accent: "#a78bfa" },
  { id: "sunset", nameKey: "theme.sunset", bg: "#160f0a", surface: "#241a12", accent: "#fb923c" },
  { id: "graphite", nameKey: "theme.graphite", bg: "#0c0d10", surface: "#16181d", accent: "#8b96a8" },
];

export function ThemeCard() {
  const { t } = useTranslation();
  const settings = useSettings();
  const current = settings.palette || "indigo";

  function pick(id: string) {
    setSetting("palette", id);
    applyPalette(id);
  }

  return (
    <Card className="mb-4">
      <h2 className="mb-1 text-base font-semibold">{t("theme.title")}</h2>
      <p className="mb-3 text-sm text-muted">{t("theme.subtitle")}</p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {THEMES.map((th) => {
          const active = current === th.id;
          return (
            <button
              key={th.id}
              onClick={() => pick(th.id)}
              aria-label={t(th.nameKey)}
              className={cn(
                "rounded-xl p-2 text-left transition-transform hover:-translate-y-0.5",
                active ? "ring-2 ring-offset-2 ring-offset-surface" : "",
              )}
              style={{
                background: th.bg,
                boxShadow: active ? `0 0 0 2px ${th.accent}` : undefined,
                // anel na cor do tema quando ativo
                ...(active ? ({ ["--tw-ring-color" as string]: th.accent }) : {}),
              }}
            >
              {/* mini-preview do app */}
              <div
                className="rounded-lg px-2 py-1.5"
                style={{ background: th.surface }}
              >
                <div className="text-[8.5px]" style={{ color: "#94a3b8" }}>
                  {t("dashboard.consolidatedBalance")}
                </div>
                <div
                  className="text-[13px] font-semibold tabular"
                  style={{ color: "#e6e9f0" }}
                >
                  R$ 1.234
                </div>
                <div className="mt-1 flex h-3.5 items-end gap-0.5">
                  <span
                    className="flex-1 rounded-sm"
                    style={{ background: th.accent, height: "100%" }}
                  />
                  <span
                    className="flex-1 rounded-sm"
                    style={{ background: th.accent, opacity: 0.55, height: "65%" }}
                  />
                  <span
                    className="flex-1 rounded-sm"
                    style={{ background: "#3a4256", height: "40%" }}
                  />
                </div>
              </div>
              <div className="mt-1.5 flex items-center justify-between gap-1">
                <span
                  className="flex items-center gap-1 text-[11px] font-medium"
                  style={{ color: "#e6e9f0" }}
                >
                  {active && <Check size={12} style={{ color: th.accent }} />}
                  {t(th.nameKey)}
                </span>
                <span
                  className="rounded px-1.5 py-0.5 text-[8px] font-semibold text-white"
                  style={{ background: th.accent }}
                >
                  +
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </Card>
  );
}
