import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/db/schema";

export interface AppSettings {
  baseCurrency: string;
  theme: "light" | "dark" | "system";
  locale: string;
  /** taxas de câmbio: quantas unidades da moeda BASE valem 1 unidade da moeda. Ex.: { USD: 5.4 } */
  rates: Record<string, number>;
}

export const DEFAULT_SETTINGS: AppSettings = {
  baseCurrency: "BRL",
  theme: "system",
  locale: "pt-BR",
  rates: {},
};

/** Cria a função de câmbio usada pelos cálculos de patrimônio. */
export function makeRateFn(
  baseCurrency: string,
  rates: Record<string, number>,
): (currency: string) => number {
  return (currency: string) =>
    currency === baseCurrency ? 1 : (rates?.[currency] ?? 1);
}

export async function getSetting<K extends keyof AppSettings>(
  key: K,
): Promise<AppSettings[K]> {
  const row = await db.settings.get(key);
  return (row?.value as AppSettings[K]) ?? DEFAULT_SETTINGS[key];
}

export async function setSetting<K extends keyof AppSettings>(
  key: K,
  value: AppSettings[K],
): Promise<void> {
  await db.settings.put({ key, value });
}

/** Hook reativo com todas as configurações (com defaults aplicados). */
export function useSettings(): AppSettings {
  const rows = useLiveQuery(() => db.settings.toArray(), [], []);
  const settings = { ...DEFAULT_SETTINGS };
  for (const row of rows) {
    (settings as Record<string, unknown>)[row.key] = row.value;
  }
  return settings;
}

/** Aplica o tema (classe `dark`) no <html>. */
export function applyTheme(theme: AppSettings["theme"]) {
  const root = document.documentElement;
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const dark = theme === "dark" || (theme === "system" && prefersDark);
  root.classList.toggle("dark", dark);
}
