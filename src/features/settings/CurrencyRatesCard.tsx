import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Card, Input, Label } from "@/components/ui/primitives";
import { useAccounts } from "@/db/hooks";
import { useSettings, setSetting } from "@/lib/settings";

/**
 * Edita as taxas de câmbio das moedas estrangeiras presentes nas contas.
 * Cada taxa = quantas unidades da moeda base valem 1 unidade da moeda.
 * Usada no patrimônio consolidado do dashboard.
 */
export function CurrencyRatesCard() {
  const { t } = useTranslation();
  const accounts = useAccounts(true);
  const settings = useSettings();

  const foreign = useMemo(() => {
    const set = new Set(
      accounts
        .map((a) => a.currency)
        .filter((c) => c && c !== settings.baseCurrency),
    );
    return [...set].sort();
  }, [accounts, settings.baseCurrency]);

  if (foreign.length === 0) return null;

  async function save(currency: string, raw: string) {
    const v = Number(raw.replace(",", "."));
    if (!Number.isFinite(v) || v <= 0) return;
    await setSetting("rates", { ...settings.rates, [currency]: v });
  }

  return (
    <Card className="mb-4">
      <h2 className="mb-1 text-base font-semibold">{t("fx.title")}</h2>
      <p className="mb-3 text-sm text-muted">
        {t("fx.desc", { base: settings.baseCurrency })}
      </p>
      <div className="space-y-2">
        {foreign.map((cur) => (
          <div key={cur} className="flex items-center gap-3">
            <Label className="mb-0 w-24">
              {t("fx.rateLabel", { cur, base: settings.baseCurrency })}
            </Label>
            <Input
              inputMode="decimal"
              className="w-32 tabular"
              placeholder="0,00"
              defaultValue={settings.rates[cur] ? String(settings.rates[cur]) : ""}
              onBlur={(e) => save(cur, e.target.value)}
            />
          </div>
        ))}
      </div>
    </Card>
  );
}
