import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import {
  LANGS,
  langInfo,
  applyDir,
  detectInitialLang,
  setActiveLocale,
  LANG_STORAGE_KEY,
  type Lang,
  type LangInfo,
} from "./config";
import { pt } from "./locales/pt";
import { en } from "./locales/en";
import { es } from "./locales/es";
import { setSetting } from "@/lib/settings";

export { LANGS, langInfo, type Lang, type LangInfo } from "./config";

/**
 * Idiomas com tradução pronta. Adicionar um idioma = importar o arquivo
 * e registrar aqui (a entrada de metadados fica em ./config LANGS).
 */
const RESOURCES: Record<string, { translation: object }> = {
  pt: { translation: pt },
  en: { translation: en },
  es: { translation: es },
};

/** Idiomas selecionáveis (têm tradução), na ordem do registro de metadados. */
export function availableLangs(): Array<{ code: Lang } & LangInfo> {
  return Object.keys(LANGS)
    .filter((code) => code in RESOURCES)
    .map((code) => ({ code, ...langInfo(code) }));
}

/** Inicializa a i18n. Chamar uma vez no boot, antes do render. */
export async function initI18n(lang: Lang = detectInitialLang()): Promise<void> {
  await i18n.use(initReactI18next).init({
    resources: RESOURCES,
    lng: lang,
    fallbackLng: "pt",
    interpolation: { escapeValue: false }, // React já escapa
    react: { useSuspense: false },
  });
  setActiveLocale(langInfo(lang).locale);
  applyDir(lang);
}

/** Troca o idioma e persiste (Dexie + localStorage para boot rápido). */
export async function setLanguage(lang: Lang): Promise<void> {
  await i18n.changeLanguage(lang);
  setActiveLocale(langInfo(lang).locale);
  applyDir(lang);
  try {
    localStorage.setItem(LANG_STORAGE_KEY, lang);
  } catch {
    /* ignore */
  }
  // moeda/locale de exibição acompanham o idioma
  await setSetting("locale", langInfo(lang).locale);
  await setSetting("language", lang);
}

export default i18n;
