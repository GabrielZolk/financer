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
 * Com `deleteAccount: true` também remove a linha `auth.users` (o e-mail) —
 * isso só é possível no servidor (service-role), via `/api/delete-account`.
 */
export class DeleteAccountUnavailable extends Error {
  constructor() {
    super("delete_account_unavailable");
  }
}

export async function eraseAllData(
  opts: { deleteAccount?: boolean } = {},
): Promise<void> {
  const userId = getCurrentUserId();
  const online = supabase && userId && userId !== "local";

  /*
   * 0. Excluir a CONTA de login vem antes de tudo: precisa do token (some no
   * logout) e, se o servidor não puder fazer, é melhor abortar com nada
   * apagado do que deixar o usuário sem dados e ainda com a conta de pé.
   */
  if (opts.deleteAccount && online) {
    const { data } = await supabase!.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new DeleteAccountUnavailable();
    let res: Response;
    try {
      res = await fetch("/api/delete-account", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch {
      throw new DeleteAccountUnavailable();
    }
    // 401 = token já morreu junto com a conta (repetição) -> segue o wipe
    if (!res.ok && res.status !== 401) throw new DeleteAccountUnavailable();
  }

  // 1. para o auto-sync pra não re-enviar nada durante o processo
  stopAutoSync();

  // 2. nuvem: apaga anexos do Storage + todos os registros, depois logout
  if (online) {
    try {
      const { data: files } = await supabase!.storage.from(BUCKET).list(userId);
      if (files && files.length) {
        await supabase!.storage
          .from(BUCKET)
          .remove(files.map((f) => `${userId}/${f.name}`));
      }
      await supabase!.from("records").delete().eq("user_id", userId);
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
