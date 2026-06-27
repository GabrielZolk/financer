/**
 * Operações de tag sobre o banco. Como tags são strings livres espalhadas em
 * `transaction.tags` e em `split.tags`, renomear/mesclar/excluir precisa
 * reescrever TODAS as ocorrências. Cada lançamento alterado é marcado `dirty`
 * (via repo.update) para sincronizar.
 */
import { db } from "@/db/schema";
import { update } from "@/db/repo";
import type { Transaction } from "@/db/types";

/** Aplica a troca `sources → target` numa lista de tags, sem duplicar. */
function remap(
  tags: string[] | undefined,
  sources: Set<string>,
  target: string,
): { tags: string[]; changed: boolean } {
  const arr = tags ?? [];
  if (!arr.some((x) => sources.has(x))) return { tags: arr, changed: false };
  const out: string[] = [];
  const seen = new Set<string>();
  for (const x of arr) {
    const v = sources.has(x) ? target : x;
    if (!seen.has(v)) {
      seen.add(v);
      out.push(v);
    }
  }
  return { tags: out, changed: true };
}

/**
 * Mescla `sources` em `target` em todos os lançamentos (e seus itens de
 * divisão). Renomear é o caso particular `mergeTags([antiga], nova)`.
 * Retorna quantos lançamentos foram alterados.
 */
export async function mergeTags(
  sources: string[],
  target: string,
): Promise<number> {
  const src = new Set(sources.map((s) => s.trim()).filter((s) => s && s !== target));
  const tgt = target.trim();
  if (!src.size || !tgt) return 0;

  const all = (await db.transactions.toArray()) as Transaction[];
  let changed = 0;

  for (const t of all) {
    if (t.deleted === 1) continue;
    const base = remap(t.tags, src, tgt);
    let splits = t.splits;
    let splitChanged = false;
    if (splits) {
      splits = splits.map((s) => {
        const r = remap(s.tags, src, tgt);
        if (r.changed) {
          splitChanged = true;
          return { ...s, tags: r.tags };
        }
        return s;
      });
    }
    if (base.changed || splitChanged) {
      await update<Transaction>("transactions", t.id, {
        tags: base.tags,
        ...(splitChanged ? { splits } : {}),
      });
      changed++;
    }
  }
  return changed;
}

/** Renomeia uma tag em todo o banco. */
export function renameTag(from: string, to: string): Promise<number> {
  return mergeTags([from], to);
}

/** Remove uma tag de todos os lançamentos (não apaga os lançamentos). */
export async function deleteTag(tag: string): Promise<number> {
  const t0 = tag.trim();
  if (!t0) return 0;
  const all = (await db.transactions.toArray()) as Transaction[];
  let changed = 0;

  for (const t of all) {
    if (t.deleted === 1) continue;
    const baseHas = (t.tags ?? []).includes(t0);
    const baseTags = baseHas ? t.tags.filter((x) => x !== t0) : t.tags;
    let splits = t.splits;
    let splitChanged = false;
    if (splits) {
      splits = splits.map((s) => {
        if (s.tags?.includes(t0)) {
          splitChanged = true;
          return { ...s, tags: s.tags.filter((x) => x !== t0) };
        }
        return s;
      });
    }
    if (baseHas || splitChanged) {
      await update<Transaction>("transactions", t.id, {
        tags: baseTags,
        ...(splitChanged ? { splits } : {}),
      });
      changed++;
    }
  }
  return changed;
}
