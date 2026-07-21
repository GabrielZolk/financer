import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/db/schema";

export interface AppSettings {
  baseCurrency: string;
  theme: "light" | "dark" | "system";
  /** paleta de cores: "indigo" (padrão) | "emerald" | "ocean" | "violet" | "sunset" | "graphite". */
  palette: string;
  locale: string;
  /** idioma da interface: "pt" | "en" | "es". */
  language: string;
  /** taxas de câmbio: quantas unidades da moeda BASE valem 1 unidade da moeda. Ex.: { USD: 5.4 } */
  rates: Record<string, number>;
  /** Recursos de IA (opt-in, desligado por padrão). Manda dados pra API externa. */
  aiEnabled: boolean;
}

export const DEFAULT_SETTINGS: AppSettings = {
  baseCurrency: "BRL",
  theme: "system",
  palette: "indigo",
  locale: "pt-BR",
  language: "pt",
  rates: {},
  aiEnabled: false,
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

/** Aplica a paleta de cores (atributo `data-theme` no <html>). */
export function applyPalette(palette: string) {
  const root = document.documentElement;
  if (!palette || palette === "indigo") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", palette);
}
