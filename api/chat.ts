/**
 * Proxy serverless do chat de IA (Fase D) — o assistente responde perguntas
 * sobre as finanças do usuário a partir de um "retrato" agregado (SEM os
 * lançamentos crus). Mesma segurança do /api/ai: chave só server-side, exige
 * token do Supabase. AI_MOCK=1 responde sem chamar a xAI.
 */

export const config = { runtime: "nodejs" };

interface Msg {
  role: "user" | "assistant";
  content: string;
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}
const env = (k: string) => process.env[k];

/**
 * Ferramentas que o assistente pode *propor*. Nada é executado no servidor:
 * o app mostra um cartão de confirmação e só age se o usuário aceitar.
 */
const TOOLS = [
  {
    type: "function",
    function: {
      name: "criar_meta",
      description:
        "Propõe criar uma meta de economia. Use quando o usuário pedir para criar/definir uma meta ou objetivo de guardar dinheiro.",
      parameters: {
        type: "object",
        properties: {
          nome: { type: "string", description: "Nome curto da meta, ex.: 'Carro'" },
          valorAlvo: {
            type: "number",
            description: "Valor alvo na moeda do retrato (5000 = cinco mil)",
          },
          dataAlvo: {
            type: "string",
            description: "Prazo opcional, formato YYYY-MM-DD",
          },
        },
        required: ["nome", "valorAlvo"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "criar_orcamento",
      description:
        "Propõe definir o orçamento (limite de gasto) mensal de uma categoria existente.",
      parameters: {
        type: "object",
        properties: {
          categoria: {
            type: "string",
            description:
              "Nome EXATO de uma categoria que aparece no retrato financeiro",
          },
          valorLimite: {
            type: "number",
            description: "Limite mensal na moeda do retrato",
          },
        },
        required: ["categoria", "valorLimite"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "criar_lancamento",
      description:
        "Propõe registrar uma despesa ou receita. Use quando o usuário disser que gastou/recebeu algo e quiser lançar.",
      parameters: {
        type: "object",
        properties: {
          tipo: { type: "string", enum: ["despesa", "receita"] },
          valor: { type: "number", description: "Valor na moeda do retrato" },
          descricao: { type: "string" },
          categoria: {
            type: "string",
            description: "Nome de uma categoria existente (opcional)",
          },
          conta: {
            type: "string",
            description: "Nome de uma conta/cartão existente (opcional)",
          },
          data: { type: "string", description: "YYYY-MM-DD (opcional)" },
        },
        required: ["tipo", "valor", "descricao"],
      },
    },
  },
];

/** Resposta falsa (AI_MOCK=1) — permite testar o fluxo sem gastar crédito. */
function mockReply(messages: Msg[], snapshot: unknown) {
  const s = snapshot as { saldoTotal?: number; currency?: string };
  const last = (messages[messages.length - 1]?.content || "").toLowerCase();
  const num = Number(
    (last.match(/[\d.]+,\d{2}|\d[\d.]*/)?.[0] || "")
      .replace(/\./g, "")
      .replace(",", "."),
  );
  if (/meta|objetivo|juntar|guardar/.test(last) && num > 0) {
    return {
      reply: "(modo teste) Posso criar essa meta pra você:",
      action: {
        name: "criar_meta",
        args: { nome: "Meta do teste", valorAlvo: num },
      },
    };
  }
  return {
    reply:
      `(modo teste) Seu saldo total é ${s.currency ?? "BRL"} ${s.saldoTotal ?? 0}. ` +
      "Ligue a chave real da xAI pra respostas completas sobre suas finanças.",
  };
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const token = (req.headers.get("authorization") || "").replace(
    /^Bearer\s+/i,
    "",
  );
  if (!token) return json({ error: "unauthorized" }, 401);
  const supaUrl = env("SUPABASE_URL") || env("VITE_SUPABASE_URL");
  const anon = env("SUPABASE_ANON_KEY") || env("VITE_SUPABASE_ANON_KEY");
  if (!supaUrl || !anon) return json({ error: "server_misconfigured" }, 500);
  try {
    const u = await fetch(`${supaUrl}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${token}`, apikey: anon },
    });
    if (!u.ok) return json({ error: "unauthorized" }, 401);
  } catch {
    return json({ error: "auth_check_failed" }, 502);
  }

  let body: { messages?: Msg[]; snapshot?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "bad_body" }, 400);
  }
  const messages = Array.isArray(body.messages) ? body.messages.slice(-12) : [];
  if (!messages.length) return json({ error: "no_messages" }, 400);
  const snapshot = body.snapshot ?? {};

  if (env("AI_MOCK") === "1") return json(mockReply(messages, snapshot));

  const key = env("XAI_API_KEY");
  if (!key) return json({ error: "ai_not_configured" }, 503);
  const model = env("XAI_MODEL") || "grok-4-fast";

  const system = [
    "Você é o assistente financeiro do app Financer (pt-BR). Responda com base APENAS nos dados agregados abaixo (JSON).",
    "Seja direto, amigável e conciso. Valores na moeda do retrato. Use listas curtas quando ajudar.",
    "Se o dado não estiver no retrato, diga que não tem essa informação — não invente números.",
    "Você NÃO dá aconselhamento financeiro profissional; ofereça observações e ideias práticas, sem recomendar investimentos.",
    "AÇÕES: quando o usuário PEDIR para criar/registrar algo (meta, orçamento, lançamento), chame a ferramenta correspondente em vez de explicar o caminho na interface.",
    "Ao chamar uma ferramenta, escreva também uma frase curta apresentando a proposta. NUNCA diga que já criou/salvou: o app mostra um cartão e o usuário confirma.",
    "Use apenas nomes de categorias e contas que aparecem no retrato. Uma ferramenta por resposta.",
    "Retrato financeiro do usuário (JSON):",
    JSON.stringify(snapshot),
  ].join("\n");

  let aiRes: Response;
  try {
    aiRes = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model,
        stream: true,
        temperature: 0.3,
        tools: TOOLS,
        tool_choice: "auto",
        messages: [{ role: "system", content: system }, ...messages],
      }),
    });
  } catch {
    return json({ error: "ai_unreachable" }, 502);
  }
  if (!aiRes.ok || !aiRes.body) {
    return json({ error: "ai_error", status: aiRes.status }, 502);
  }
  // repassa o stream SSE da xAI direto pro cliente (resposta token a token)
  return new Response(aiRes.body, {
    status: 200,
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
    },
  });
}
