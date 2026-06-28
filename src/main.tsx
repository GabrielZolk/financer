import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import { seedIfEmpty } from "@/db/seed";
import { getSetting, applyTheme, applyPalette } from "@/lib/settings";
import { initAuth } from "@/lib/sync";
import { initPrivacy } from "@/lib/privacy";
import { initAppLock } from "@/lib/applock";
import { runRecurrences } from "@/features/recurrences/runRecurrences";
import { initI18n } from "@/lib/i18n";
import { normalizeLang, detectInitialLang } from "@/lib/i18n/config";

async function bootstrap() {
  await seedIfEmpty();

  // idioma: preferência salva (Dexie) → localStorage/navegador
  const savedLang = await getSetting("language");
  await initI18n(savedLang ? normalizeLang(savedLang) : detectInitialLang());

  applyTheme(await getSetting("theme"));
  applyPalette(await getSetting("palette"));
  await initPrivacy();
  initAppLock();

  // gera lançamentos recorrentes vencidos (assinaturas, salário, etc.)
  await runRecurrences();

  // inicializa auth/sync (no-op se Supabase não estiver configurado)
  void initAuth();

  // reage a mudanças do tema do sistema quando em modo "system"
  window
    .matchMedia("(prefers-color-scheme: dark)")
    .addEventListener("change", async () => {
      if ((await getSetting("theme")) === "system") applyTheme("system");
    });

  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

bootstrap();
