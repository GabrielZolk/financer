import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import { seedIfEmpty } from "@/db/seed";
import { getSetting, applyTheme } from "@/lib/settings";
import { initAuth } from "@/lib/sync";
import { initPrivacy } from "@/lib/privacy";
import { initAppLock } from "@/lib/applock";
import { runRecurrences } from "@/features/recurrences/runRecurrences";

async function bootstrap() {
  await seedIfEmpty();
  applyTheme(await getSetting("theme"));
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
