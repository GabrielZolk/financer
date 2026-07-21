import { supabase } from "@/lib/supabase";
import { AiError } from "@/lib/ai";
import type { FinancialSnapshot } from "@/lib/aiSnapshot";

export interface ChatMsg {
  role: "user" | "assistant";
  content: string;
}

/**
 * Pergunta ao assistente financeiro (Fase D). Manda só agregados, nunca crus.
 * Faz streaming: chama `onToken` a cada pedaço; retorna o texto completo.
 * Se o servidor responder JSON (ex.: AI_MOCK), cai no modo não-streaming.
 */
export async function askAssistant(
  messages: ChatMsg[],
  snapshot: FinancialSnapshot,
  onToken?: (fullSoFar: string) => void,
): Promise<string> {
  if (!supabase) throw new AiError("ai_needs_login");
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new AiError("ai_needs_login");

  let res: Response;
  try {
    res = await fetch("/api/chat", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ messages, snapshot }),
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

  const ct = res.headers.get("content-type") || "";

  // não-streaming (mock): {reply}
  if (!ct.includes("text/event-stream") || !res.body) {
    const b = (await res.json()) as { reply?: string };
    const reply = b.reply ?? "";
    onToken?.(reply);
    return reply;
  }

  // streaming SSE (OpenAI-compatível): acumula delta.content
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  let full = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const line of lines) {
      const s = line.trim();
      if (!s.startsWith("data:")) continue;
      const payload = s.slice(5).trim();
      if (payload === "[DONE]") continue;
      try {
        const j = JSON.parse(payload) as {
          choices?: { delta?: { content?: string } }[];
        };
        const piece = j.choices?.[0]?.delta?.content;
        if (piece) {
          full += piece;
          onToken?.(full);
        }
      } catch {
        /* ignora linhas parciais */
      }
    }
  }
  return full;
}
