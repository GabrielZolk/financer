/**
 * Configuração de idiomas. Mantido SEM importar i18next para evitar
 * dependência circular (money.ts / format.ts importam daqui).
 *
 * Escala por registro: adicionar um idioma = adicionar uma entrada aqui
 * + um arquivo em `locales/`. O seletor lista só os que têm tradução.
 */

/** Código curto BCP-47 (ex.: "pt", "en", "fr"). */
export type Lang = string;

export interface LangInfo {
  /** Nome no próprio idioma (autônimo). */
  label: string;
  /** Locale BCP-47 usado pelo Intl (datas/números/moeda). */
  locale: string;
  /** Direção do texto. */
  dir: "ltr" | "rtl";
}

/**
 * Registro de idiomas conhecidos (metadados). Ter a entrada aqui é barato;
 * o idioma só aparece no seletor quando existe o arquivo de tradução
 * correspondente carregado na i18n (ver `availableLangs` em ./index).
 */
export const LANGS: Record<string, LangInfo> = {
  pt: { label: "Português", locale: "pt-BR", dir: "ltr" },
  en: { label: "English", locale: "en-US", dir: "ltr" },
  es: { label: "Español", locale: "es-ES", dir: "ltr" },
  fr: { label: "Français", locale: "fr-FR", dir: "ltr" },
  de: { label: "Deutsch", locale: "de-DE", dir: "ltr" },
  it: { label: "Italiano", locale: "it-IT", dir: "ltr" },
  nl: { label: "Nederlands", locale: "nl-NL", dir: "ltr" },
  pl: { label: "Polski", locale: "pl-PL", dir: "ltr" },
  tr: { label: "Türkçe", locale: "tr-TR", dir: "ltr" },
  ru: { label: "Русский", locale: "ru-RU", dir: "ltr" },
  uk: { label: "Українська", locale: "uk-UA", dir: "ltr" },
  ja: { label: "日本語", locale: "ja-JP", dir: "ltr" },
  zh: { label: "中文", locale: "zh-CN", dir: "ltr" },
  ko: { label: "한국어", locale: "ko-KR", dir: "ltr" },
  hi: { label: "हिन्दी", locale: "hi-IN", dir: "ltr" },
  id: { label: "Bahasa Indonesia", locale: "id-ID", dir: "ltr" },
  vi: { label: "Tiếng Việt", locale: "vi-VN", dir: "ltr" },
  th: { label: "ไทย", locale: "th-TH", dir: "ltr" },
  ar: { label: "العربية", locale: "ar", dir: "rtl" },
  he: { label: "עברית", locale: "he-IL", dir: "rtl" },
};

export const DEFAULT_LANG: Lang = "pt";

/** Chave no localStorage para boot instantâneo (antes do Dexie carregar). */
export const LANG_STORAGE_KEY = "fin.lang";

/** Info de um idioma (cai no padrão se desconhecido). */
export function langInfo(code: string): LangInfo {
  return LANGS[code] ?? LANGS[DEFAULT_LANG];
}

/** Normaliza um valor arbitrário para um código de idioma conhecido. */
export function normalizeLang(value: string | null | undefined): Lang {
  if (!value) return DEFAULT_LANG;
  const short = value.toLowerCase().slice(0, 2);
  return LANGS[short] ? short : DEFAULT_LANG;
}

/** Detecta o idioma inicial: localStorage → navegador → padrão. */
export function detectInitialLang(): Lang {
  if (typeof localStorage !== "undefined") {
    const saved = localStorage.getItem(LANG_STORAGE_KEY);
    if (saved) return normalizeLang(saved);
  }
  if (typeof navigator !== "undefined" && navigator.language) {
    return normalizeLang(navigator.language);
  }
  return DEFAULT_LANG;
}

/** Aplica direção do texto (lang/dir) no <html> — importante p/ árabe/hebraico. */
export function applyDir(code: string): void {
  if (typeof document === "undefined") return;
  const info = langInfo(code);
  document.documentElement.lang = code;
  document.documentElement.dir = info.dir;
}

// --- Locale ativo (lido por money.ts e format.ts sem passar parâmetro) ---
let activeLocale: string = LANGS[DEFAULT_LANG].locale;

export function getActiveLocale(): string {
  return activeLocale;
}

export function setActiveLocale(locale: string): void {
  activeLocale = locale;
}
