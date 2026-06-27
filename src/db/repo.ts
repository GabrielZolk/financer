import { db, type SyncableTable } from "./schema";
import type { SyncFields } from "./types";
import { nowIso, uid } from "@/lib/utils";

/** userId corrente — "local" enquanto offline-only; trocado ao logar no Supabase. */
let currentUserId = "local";
export function setCurrentUserId(id: string) {
  currentUserId = id;
}
export function getCurrentUserId() {
  return currentUserId;
}

type NewEntity<T> = Omit<T, keyof SyncFields> & Partial<SyncFields>;

/**
 * Cria um registro preenchendo automaticamente os campos de sync.
 * Marca `dirty: 1` para o motor de sync enviar depois.
 */
export async function create<T extends SyncFields>(
  table: SyncableTable,
  data: NewEntity<T>,
): Promise<T> {
  const ts = nowIso();
  const entity = {
    id: uid(),
    userId: currentUserId,
    createdAt: ts,
    updatedAt: ts,
    deleted: 0,
    dirty: 1,
    ...data,
  } as unknown as T;
  await db.table(table).put(entity);
  return entity;
}

/** Atualiza um registro, renovando updatedAt e marcando dirty. */
export async function update<T extends SyncFields>(
  table: SyncableTable,
  id: string,
  changes: Partial<T>,
): Promise<void> {
  await db.table(table).update(id, {
    ...changes,
    updatedAt: nowIso(),
    dirty: 1,
  });
}

/** Soft delete: mantém o registro marcado até o sync confirmar a remoção. */
export async function softDelete(
  table: SyncableTable,
  id: string,
): Promise<void> {
  await db.table(table).update(id, {
    deleted: 1,
    updatedAt: nowIso(),
    dirty: 1,
  });
}

/** Insere vários registros de uma vez (ex.: parcelas, par de transferência). */
export async function bulkCreate<T extends SyncFields>(
  table: SyncableTable,
  items: NewEntity<T>[],
): Promise<T[]> {
  const ts = nowIso();
  const entities = items.map(
    (data) =>
      ({
        id: uid(),
        userId: currentUserId,
        createdAt: ts,
        updatedAt: ts,
        deleted: 0,
        dirty: 1,
        ...data,
      }) as unknown as T,
  );
  await db.table(table).bulkPut(entities);
  return entities;
}
