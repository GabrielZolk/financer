import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { setCurrentUserId } from "@/db/repo";
import { setSyncState } from "./state";
import {
  startAutoSync,
  stopAutoSync,
  claimLocalData,
  resetSyncCursor,
} from "./engine";

/**
 * Inicializa a autenticação e reage a login/logout:
 *  - login  → adota dados offline, define userId e inicia o auto-sync
 *  - logout → para o sync e volta ao modo local
 * Quando o Supabase não está configurado, mantém o app em modo local.
 */
export async function initAuth(): Promise<void> {
  if (!isSupabaseConfigured || !supabase) {
    setSyncState({ status: "disabled" });
    setCurrentUserId("local");
    return;
  }

  const applySession = async (
    userId: string | null,
    email: string | null,
    isFreshLogin: boolean,
  ) => {
    if (userId) {
      if (isFreshLogin) await claimLocalData(userId);
      setCurrentUserId(userId);
      setSyncState({ status: "idle", email });
      startAutoSync(userId);
    } else {
      stopAutoSync();
      setCurrentUserId("local");
      await resetSyncCursor();
      setSyncState({
        status: "signed_out",
        email: null,
        pending: 0,
        lastSyncAt: null,
      });
    }
  };

  // sessão inicial
  const { data } = await supabase.auth.getSession();
  const session = data.session;
  await applySession(
    session?.user.id ?? null,
    session?.user.email ?? null,
    false,
  );

  // mudanças de auth
  supabase.auth.onAuthStateChange((event, session) => {
    const fresh = event === "SIGNED_IN";
    void applySession(
      session?.user.id ?? null,
      session?.user.email ?? null,
      fresh,
    );
  });
}

export async function signIn(email: string, password: string) {
  if (!supabase) throw new Error("Sync não configurado.");
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
}

export async function signUp(email: string, password: string) {
  if (!supabase) throw new Error("Sync não configurado.");
  const { error } = await supabase.auth.signUp({ email, password });
  if (error) throw error;
}

export async function signOut() {
  if (!supabase) return;
  await supabase.auth.signOut();
}
