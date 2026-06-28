import { useMemo, useState } from "react";
import { Globe, Check, Search } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Card, Input } from "@/components/ui/primitives";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useSettings } from "@/lib/settings";
import { availableLangs, setLanguage, langInfo } from "@/lib/i18n";

const SAMPLE = new Date(2026, 5, 27); // 27/06/2026

/** Prévia do formato de data + dinheiro para um locale (o "toque" que mostra o que muda). */
function preview(locale: string, currency: string): string {
  const date = SAMPLE.toLocaleDateString(locale, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  const money = new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
  }).format(1234.56);
  return `${date} · ${money}`;
}

export function LanguageCard() {
  const settings = useSettings();
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");

  const current = langInfo(settings.language);
  const langs = availableLangs();

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return langs;
    return langs.filter(
      (l) =>
        l.label.toLowerCase().includes(s) ||
        l.code.includes(s) ||
        l.locale.toLowerCase().includes(s),
    );
  }, [q, langs]);

  async function pick(code: string) {
    await setLanguage(code);
    setOpen(false);
    setQ("");
  }

  return (
    <Card className="mb-4">
      <h2 className="mb-3 text-base font-semibold">{t("settings.language")}</h2>
      <button
        onClick={() => setOpen(true)}
        className="flex w-full items-center justify-between rounded-xl border border-border px-3 py-2.5 text-left transition-colors hover:bg-surface-2"
      >
        <span className="flex items-center gap-3">
          <Globe size={18} className="shrink-0 text-muted" />
          <span>
            <span className="block text-sm font-medium">{current.label}</span>
            <span className="block text-xs text-muted">
              {preview(current.locale, settings.baseCurrency)}
            </span>
          </span>
        </span>
        <span className="text-xs text-muted">{t("common.edit")}</span>
      </button>
      <p className="mt-2 text-xs text-muted">{t("settings.languageHint")}</p>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title={t("settings.language")}>
          <div className="relative mb-3">
            <Search
              size={16}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
            />
            <Input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t("common.search")}
              className="pl-9"
            />
          </div>
          <div className="flex max-h-[50vh] flex-col gap-1 overflow-y-auto">
            {filtered.map((l) => {
              const active = l.code === settings.language;
              return (
                <button
                  key={l.code}
                  onClick={() => pick(l.code)}
                  dir={l.dir}
                  className={cn(
                    "flex items-center justify-between rounded-xl px-3 py-2.5 text-left transition-colors",
                    active ? "bg-primary/10" : "hover:bg-surface-2",
                  )}
                >
                  <span>
                    <span
                      className={cn(
                        "block text-sm font-medium",
                        active && "text-primary",
                      )}
                    >
                      {l.label}
                    </span>
                    <span className="block text-xs text-muted" dir="ltr">
                      {preview(l.locale, settings.baseCurrency)}
                    </span>
                  </span>
                  {active && (
                    <Check size={16} className="shrink-0 text-primary" />
                  )}
                </button>
              );
            })}
            {filtered.length === 0 && (
              <p className="py-6 text-center text-sm text-muted">—</p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
