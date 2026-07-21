import { supabase } from "@/lib/supabase";
import { AiError } from "@/lib/ai";

/**
 * Auto-categoriza em lote as descrições de um extrato importado.
 * Devolve um array alinhado a `items`: o categoryId (ou null) de cada linha.
 */
export async function categorizeImport(
  items: string[],
  categories: { id: string; name: string; kind?: string }[],
): Promise<(string | null)[]> {
  if (!supabase) throw new AiError("ai_needs_login");
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new AiError("ai_needs_login");

  let res: Response;
  try {
    res = await fetch("/api/categorize", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ items, categories }),
    });
  } catch {
    throw new AiError("ai_unreachable");
  }
  if (!res.ok) {
    let code = "ai_error";
    try {
      const b = (await res.json()) as { error?: string };
      if (b?.error) code = b.error;
    } catch {
      /* ignore */
    }
    throw new AiError(code);
  }
  const data2 = (await res.json()) as {
    results?: { i: number; categoryId: string | null }[];
  };
  const out: (string | null)[] = items.map(() => null);
  for (const r of data2.results ?? []) {
    if (r.i >= 0 && r.i < out.length) out[r.i] = r.categoryId;
  }
  return out;
}
