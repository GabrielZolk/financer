import { supabase } from "@/lib/supabase";
import { db } from "@/db/schema";
import { setCurrentUserId } from "@/db/repo";
import { nowIso } from "@/lib/utils";
import { setSyncState } from "./state";
import { syncPrivacyMeta } from "@/lib/privacy";
import { syncAttachments } from "./attachments";
import type { SyncFields } from "@/db/types";

/**
 * Tabelas sincronizadas na nuvem. `attachments` fica de fora por ora (blobs
 * vão para o Supabase Storage na Fase 4).
 */
const CLOUD_TABLES = [
  "accounts",
  "categories",
  "transactions",
  "budgets",
  "goals",
  "recurrences",
] as const;
type CloudTable = (typeof CLOUD_TABLES)[number];

const LAST_PULLED_KEY = "sync.lastPulledAt";
const BATCH = 200;

interface RecordRow {
  id: string;
  user_id: string;
  table_name: string;
  data: Record<string, unknown>;
  updated_at: string;
  deleted: boolean;
}

function ms(iso: string | null | undefined): number {
  return iso ? Date.parse(iso) : 0;
}

async function getLastPulled(): Promise<string | null> {
  const row = await db.settings.get(LAST_PULLED_KEY);
  return (row?.value as string) ?? null;
}
async function setLastPulled(iso: string) {
  await db.settings.put({ key: LAST_PULLED_KEY, value: iso });
}

/** Conta registros locais pendentes de envio. */
export async function countPending(): Promise<number> {
  let total = 0;
  for (const t of CLOUD_TABLES) {
    total += await db.table(t).where("dirty").equals(1).count();
  }
  return total;
}

async function refreshPending() {
  setSyncState({ pending: await countPending() });
}

/**
 * Ao logar pela primeira vez, "adota" os dados criados offline (userId
 * "local") para o usuário real e marca tudo como dirty para subir.
 */
export async function claimLocalData(userId: string): Promise<void> {
  for (const t of CLOUD_TABLES) {
    const all = (await db.table(t).toArray()) as SyncFields[];
    const locals = all.filter((r) => r.userId === "local");
    if (!locals.length) continue;
    await db.table(t).bulkPut(locals.map((r) => ({ ...r, userId, dirty: 1 })));
  }
}

/* --------------------------------- PULL ----------------------------------- */
async function pull(userId: string): Promise<void> {
  if (!supabase) return;
  const since = await getLastPulled();
  let query = supabase
    .from("records")
    .select("*")
    .eq("user_id", userId)
    .order("updated_at", { ascending: true })
    .limit(1000);
  if (since) query = query.gte("updated_at", since);

  const { data, error } = await query;
  if (error) throw error;
  const rows = (data ?? []) as RecordRow[];
  if (!rows.length) return;

  let maxUpdated = since ?? "";
  // agrupa por tabela para escrever em lote
  const byTable = new Map<CloudTable, SyncFields[]>();
  for (const row of rows) {
    if (ms(row.updated_at) > ms(maxUpdated)) maxUpdated = row.updated_at;
    const table = row.table_name as CloudTable;
    if (!CLOUD_TABLES.includes(table)) continue;

    const local = (await db.table(table).get(row.id)) as SyncFields | undefined;
    // last-write-wins: só aplica se o servidor for mais novo (ou igual) que o local
    if (local && ms(local.updatedAt) > ms(row.updated_at)) continue;

    const entity = {
      ...(row.data as object),
      id: row.id,
      userId: row.user_id,
      updatedAt: row.updated_at,
      deleted: row.deleted ? 1 : 0,
      dirty: 0,
    } as SyncFields;

    const arr = byTable.get(table) ?? [];
    arr.push(entity);
    byTable.set(table, arr);
  }

  for (const [table, entities] of byTable) {
    await db.table(table).bulkPut(entities);
  }
  if (maxUpdated) await setLastPulled(maxUpdated);
}

/* --------------------------------- PUSH ----------------------------------- */
async function push(userId: string): Promise<void> {
  if (!supabase) return;
  for (const table of CLOUD_TABLES) {
    const dirty = (await db
      .table(table)
      .where("dirty")
      .equals(1)
      .toArray()) as SyncFields[];
    if (!dirty.length) continue;

    for (let i = 0; i < dirty.length; i += BATCH) {
      const slice = dirty.slice(i, i + BATCH);
      const payload: RecordRow[] = slice.map((entity) => {
        // não enviamos a flag local `dirty` para a nuvem
        const { dirty: _omit, ...rest } = entity as SyncFields & {
          dirty: 0 | 1;
        };
        void _omit;
        return {
          id: entity.id,
          user_id: userId,
          table_name: table,
          data: rest as Record<string, unknown>,
          updated_at: entity.updatedAt,
          deleted: entity.deleted === 1,
        };
      });

      const { error } = await supabase
        .from("records")
        .upsert(payload, { onConflict: "id" });
      if (error) throw error;

      // sucesso → limpa a flag dirty localmente (se não mudou nesse meio tempo)
      await db.transaction("rw", db.table(table), async () => {
        for (const entity of slice) {
          const current = (await db.table(table).get(entity.id)) as
            | SyncFields
            | undefined;
          if (current && current.updatedAt === entity.updatedAt) {
            await db.table(table).update(entity.id, { dirty: 0 });
          }
        }
      });
    }
  }
}

let syncing = false;

/** Sincronização completa: puxa do servidor e empurra as pendências locais. */
export async function fullSync(userId: string): Promise<void> {
  if (!supabase || syncing) return;
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    setSyncState({ status: "offline" });
    return;
  }
  syncing = true;
  setSyncState({ status: "syncing", error: null });
  try {
    await pull(userId);
    await push(userId);
    await syncPrivacyMeta(userId).catch(() => {});
    await syncAttachments(userId).catch(() => {});
    await refreshPending();
    setSyncState({ status: "idle", lastSyncAt: nowIso(), error: null });
  } catch (err) {
    setSyncState({ status: "error", error: (err as Error).message });
    throw err;
  } finally {
    syncing = false;
  }
}

/* ------------------------- Auto-sync (realtime + timers) ------------------- */
let cleanup: (() => void) | null = null;

export function startAutoSync(userId: string): void {
  stopAutoSync();
  setCurrentUserId(userId);

  const trigger = () => void fullSync(userId).catch(() => {});

  // 1) sync inicial
  trigger();

  // 2) realtime: mudanças vindas de outros dispositivos
  const channel = supabase
    ?.channel("records-sync")
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "records",
        filter: `user_id=eq.${userId}`,
      },
      () => trigger(),
    )
    .subscribe();

  // 3) ao voltar a ficar online
  const onOnline = () => trigger();
  window.addEventListener("online", onOnline);
  const onOffline = () => setSyncState({ status: "offline" });
  window.addEventListener("offline", onOffline);

  // 4) polling leve de segurança (a cada 60s)
  const interval = window.setInterval(trigger, 60_000);

  cleanup = () => {
    if (channel) supabase?.removeChannel(channel);
    window.removeEventListener("online", onOnline);
    window.removeEventListener("offline", onOffline);
    window.clearInterval(interval);
  };
}

export function stopAutoSync(): void {
  cleanup?.();
  cleanup = null;
}

/** Limpa o cursor de pull e dados de sync (usado no logout). */
export async function resetSyncCursor(): Promise<void> {
  await db.settings.delete(LAST_PULLED_KEY);
}
