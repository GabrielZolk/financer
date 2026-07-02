import { useEffect, useState, type ReactNode } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { useTranslation } from "react-i18next";
import { Wallet } from "lucide-react";
import { db } from "@/db/schema";
import { Button } from "@/components/ui/primitives";
import { isSupabaseConfigured } from "@/lib/supabase";
import { useSyncState } from "@/lib/sync";
import { AuthDialog } from "@/features/sync/AuthDialog";

/** Flag device-local: boas-vindas já resolvidas (escolheu conta ou convidado). */
const KEY = "fin.welcomeDone";

function markDone() {
  try {
    localStorage.setItem(KEY, "1");
  } catch {
    /* ignore */
  }
}

/**
 * Mostra a tela de boas-vindas SÓ no primeiro acesso: sem flag, deslogado e
 * sem nenhum lançamento. Quem entra como convidado e cria conta depois leva
 * os dados junto (claimLocalData no 1º login).
 */
export function WelcomeGate({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const sync = useSyncState();
  const [done, setDone] = useState(() => {
    try {
      return localStorage.getItem(KEY) === "1";
    } catch {
      return true;
    }
  });
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<"in" | "up">("up");

  const txCount = useLiveQuery(
    async () => (await db.transactions.toArray()).filter((t) => !t.deleted).length,
    [],
    undefined as number | undefined,
  );

  const signedIn =
    sync.status !== "signed_out" && sync.status !== "disabled";

  // usuário existente (logado ou com lançamentos) nunca vê as boas-vindas
  useEffect(() => {
    if (done) return;
    if (signedIn || (txCount !== undefined && txCount > 0)) {
      markDone();
      setDone(true);
    }
  }, [done, signedIn, txCount]);

  // sem Supabase configurado não há conta possível — segue direto
  if (done || !isSupabaseConfigured) return <>{children}</>;
  if (txCount === undefined) return null; // carregando (instantâneo)
  if (signedIn || txCount > 0) return <>{children}</>;

  function openAuth(mode: "in" | "up") {
    setAuthMode(mode);
    setAuthOpen(true);
  }
  function continueAsGuest() {
    markDone();
    setDone(true);
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-5 bg-bg px-6 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary text-primary-fg">
        <Wallet size={30} />
      </div>
      <div>
        <h1 className="text-2xl font-bold">Financer</h1>
        <p className="mt-1 whitespace-pre-line text-sm text-muted">
          {t("welcome.tagline")}
        </p>
      </div>

      <div className="w-full max-w-[300px] space-y-2.5">
        <Button className="w-full" onClick={() => openAuth("up")}>
          {t("welcome.createAccount")}
        </Button>
        <Button
          variant="outline"
          className="w-full"
          onClick={() => openAuth("in")}
        >
          {t("welcome.signIn")}
        </Button>
      </div>

      <div className="w-full max-w-[300px]">
        <button
          onClick={continueAsGuest}
          className="text-sm font-medium text-muted underline underline-offset-2 hover:text-text"
        >
          {t("welcome.guest")}
        </button>
        <p className="mt-2 text-xs leading-relaxed text-muted/80">
          {t("welcome.guestWarn")}
        </p>
      </div>

      <AuthDialog
        open={authOpen}
        onOpenChange={setAuthOpen}
        defaultMode={authMode}
      />
    </div>
  );
}
