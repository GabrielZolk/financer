import { supabase } from "@/lib/supabase";
import { db } from "@/db/schema";
import { nowIso } from "@/lib/utils";
import type { Attachment } from "@/db/types";

const BUCKET = "attachments";

/**
 * Sincroniza anexos: o blob vai para o Supabase Storage (binário) e os
 * metadados para a tabela `records` (table_name='attachments'). Em outro
 * dispositivo, baixa o blob do Storage quando ele não existe localmente.
 * Chamado pelo fullSync. No-op se offline / não logado.
 */
export async function syncAttachments(userId: string): Promise<void> {
  if (!supabase || userId === "local") return;

  /* ----------------------------- PUSH local ------------------------------ */
  const all = (await db.attachments.toArray()) as Attachment[];
  for (const att of all.filter((a) => a.dirty === 1)) {
    let storagePath = att.storagePath ?? null;

    if (att.deleted === 0 && att.blob && !storagePath) {
      storagePath = `${userId}/${att.id}`;
      const { error } = await supabase.storage
        .from(BUCKET)
        .upload(storagePath, att.blob, {
          upsert: true,
          contentType: att.mimeType || "application/octet-stream",
        });
      if (error) continue; // tenta de novo no próximo sync
    }
    if (att.deleted === 1 && storagePath) {
      await supabase.storage.from(BUCKET).remove([storagePath]);
    }

    const { error: recErr } = await supabase.from("records").upsert(
      {
        id: att.id,
        user_id: userId,
        table_name: "attachments",
        data: {
          transactionId: att.transactionId,
          filename: att.filename,
          mimeType: att.mimeType,
          sizeBytes: att.sizeBytes,
          storagePath,
          createdAt: att.createdAt,
        },
        updated_at: att.updatedAt,
        deleted: att.deleted === 1,
      },
      { onConflict: "id" },
    );
    if (recErr) continue;
    await db.attachments.update(att.id, { dirty: 0, storagePath });
  }

  /* ----------------------------- PULL remoto ----------------------------- */
  const { data, error } = await supabase
    .from("records")
    .select("*")
    .eq("user_id", userId)
    .eq("table_name", "attachments");
  if (error || !data) return;

  for (const row of data) {
    const local = (await db.attachments.get(row.id)) as Attachment | undefined;
    if (local && Date.parse(local.updatedAt) > Date.parse(row.updated_at))
      continue;

    const meta = row.data as {
      transactionId: string;
      filename: string;
      mimeType: string;
      sizeBytes: number;
      storagePath: string | null;
      createdAt?: string;
    };

    // baixa o blob se ainda não temos localmente
    let blob = local?.blob;
    if (!row.deleted && meta.storagePath && !blob) {
      const { data: file } = await supabase.storage
        .from(BUCKET)
        .download(meta.storagePath);
      if (file) blob = file;
    }

    await db.attachments.put({
      id: row.id,
      userId,
      transactionId: meta.transactionId,
      filename: meta.filename,
      mimeType: meta.mimeType,
      sizeBytes: meta.sizeBytes,
      storagePath: meta.storagePath,
      remoteUrl: null,
      blob,
      createdAt: meta.createdAt ?? nowIso(),
      updatedAt: row.updated_at,
      deleted: row.deleted ? 1 : 0,
      dirty: 0,
    });
  }
}
