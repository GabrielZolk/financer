import { supabase } from "@/lib/supabase";
import { AiError } from "@/lib/ai";
import type { FinancialSnapshot } from "@/lib/aiSnapshot";

/** Gera observações curtas sobre as finanças (Fase C). Só agregados. */
export async function getInsights(
  snapshot: FinancialSnapshot,
): Promise<string[]> {
  if (!supabase) throw new AiError("ai_needs_login");
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new AiError("ai_needs_login");

  let res: Response;
  try {
    res = await fetch("/api/insights", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ snapshot }),
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
  const data2 = (await res.json()) as { insights?: string[] };
  return data2.insights ?? [];
}
