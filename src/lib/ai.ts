import { supabase } from "@/lib/supabase";

export interface ParsedTx {
  kind: "expense" | "income";
  amountCents: number;
  description: string;
  categoryId: string | null;
  accountId: string | null;
  date: string; // YYYY-MM-DD
}

export interface AiContext {
  accounts: { id: string; name: string }[];
  categories: { id: string; name: string; kind?: string }[];
  currency: string;
  today: string;
}

/** Erro amigável já traduzível por código. */
export class AiError extends Error {
  constructor(public code: string) {
    super(code);
  }
}

/**
 * Interpreta um lançamento em linguagem natural via o proxy `/api/ai`.
 * A chave xAI NUNCA passa pelo client — só o token de sessão do Supabase.
 */
export async function parseNaturalTransaction(
  text: string,
  ctx: AiContext,
): Promise<ParsedTx> {
  if (!supabase) throw new AiError("ai_needs_login");
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new AiError("ai_needs_login");

  let res: Response;
  try {
    res = await fetch("/api/ai", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ text, ...ctx }),
    });
  } catch {
    throw new AiError("ai_unreachable");
  }

  if (!res.ok) {
    let code = "ai_error";
    try {
      const body = (await res.json()) as { error?: string };
      if (body?.error) code = body.error;
    } catch {
      /* ignore */
    }
    throw new AiError(code);
  }
  return (await res.json()) as ParsedTx;
}
