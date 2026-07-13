import { supabase } from "@/lib/supabase";
import { db } from "@/db/schema";
import { stopAutoSync, signOut } from "@/lib/sync";
import { getCurrentUserId } from "@/db/repo";

const BUCKET = "attachments";

/**
 * Apaga permanentemente TODOS os dados do usuário: banco local (IndexedDB),
 * registros na nuvem (`records`) e anexos no Storage — e faz logout.
 * Ao final recarrega a página: o app recria um banco vazio e cai na tela de
 * boas-vindas. Irreversível.
 *
 * Fase 1 (client-side). NÃO remove a linha `auth.users` (o e-mail) — isso exige
 * uma function serverless com service-role (ver docs/LANCAMENTO.md, MUST #1).
 */
export async function eraseAllData(): Promise<void> {
  // 1. para o auto-sync pra não re-enviar nada durante o processo
  stopAutoSync();

  // 2. nuvem: apaga anexos do Storage + todos os registros, depois logout
  const userId = getCurrentUserId();
  if (supabase && userId && userId !== "local") {
    try {
      const { data: files } = await supabase.storage.from(BUCKET).list(userId);
      if (files && files.length) {
        await supabase.storage
          .from(BUCKET)
          .remove(files.map((f) => `${userId}/${f.name}`));
      }
      await supabase.from("records").delete().eq("user_id", userId);
    } catch {
      // offline ou falha de rede: segue apagando o local do mesmo jeito
    }
    await signOut().catch(() => {});
  }

  // 3. flags locais que vivem fora do IndexedDB
  try {
    localStorage.removeItem("fin.welcomeDone");
  } catch {
    // ignore
  }

  // 4. apaga o banco local inteiro
  try {
    await db.delete();
  } catch {
    // ignore
  }

  // 5. recarrega — estado limpo, tela de boas-vindas
  window.location.reload();
}
