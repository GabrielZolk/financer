import { supabase } from "@/lib/supabase";
import { AiError } from "@/lib/ai";
import type { FinancialSnapshot } from "@/lib/aiSnapshot";
import { parseToolCall, type ActionCtx, type ChatAction } from "@/lib/aiActions";

export interface ChatMsg {
  role: "user" | "assistant";
  content: string;
}

export interface ChatAnswer {
  text: string;
  /** ação PROPOSTA pelo modelo (function-calling) — precisa de confirmação */
  action: ChatAction | null;
}

/**
 * Pergunta ao assistente financeiro (Fase D). Manda só agregados, nunca crus.
 * Faz streaming: chama `onToken` a cada pedaço; retorna o texto completo.
 * Se o servidor responder JSON (ex.: AI_MOCK), cai no modo não-streaming.
 * O modelo pode propor uma ação (criar meta/orçamento/lançamento) — nunca
 * executada aqui, só devolvida pra tela pedir confirmação.
 */
export async function askAssistant(
  messages: ChatMsg[],
  snapshot: FinancialSnapshot,
  onToken?: (fullSoFar: string) => void,
  ctx?: ActionCtx,
): Promise<ChatAnswer> {
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

  // não-streaming (mock): {reply, action?}
  if (!ct.includes("text/event-stream") || !res.body) {
    const b = (await res.json()) as {
      reply?: string;
      action?: { name?: string; args?: unknown };
    };
    const reply = b.reply ?? "";
    onToken?.(reply);
    const action =
      ctx && b.action?.name
        ? parseToolCall(b.action.name, JSON.stringify(b.action.args ?? {}), ctx)
        : null;
    return { text: reply, action };
  }

  // streaming SSE (OpenAI-compatível): acumula delta.content e delta.tool_calls
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  let full = "";
  const calls: { name: string; args: string }[] = [];
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
          choices?: {
            delta?: {
              content?: string;
              tool_calls?: {
                index?: number;
                function?: { name?: string; arguments?: string };
              }[];
            };
          }[];
        };
        const delta = j.choices?.[0]?.delta;
        if (delta?.content) {
          full += delta.content;
          onToken?.(full);
        }
        // os argumentos chegam em pedaços; junta por índice
        for (const tc of delta?.tool_calls ?? []) {
          const i = tc.index ?? 0;
          calls[i] ??= { name: "", args: "" };
          if (tc.function?.name) calls[i].name = tc.function.name;
          if (tc.function?.arguments) calls[i].args += tc.function.arguments;
        }
      } catch {
        /* ignora linhas parciais */
      }
    }
  }

  const first = calls.find((c) => c?.name);
  const action = first && ctx ? parseToolCall(first.name, first.args, ctx) : null;
  return { text: full, action };
}
