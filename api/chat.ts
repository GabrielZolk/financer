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

  if (env("AI_MOCK") === "1") {
    const s = snapshot as { saldoTotal?: number; currency?: string };
    return json({
      reply:
        `(modo teste) Seu saldo total é ${s.currency ?? "BRL"} ${s.saldoTotal ?? 0}. ` +
        "Ligue a chave real da xAI pra respostas completas sobre suas finanças.",
    });
  }

  const key = env("XAI_API_KEY");
  if (!key) return json({ error: "ai_not_configured" }, 503);
  const model = env("XAI_MODEL") || "grok-4-fast";

  const system = [
    "Você é o assistente financeiro do app Financer (pt-BR). Responda com base APENAS nos dados agregados abaixo (JSON).",
    "Seja direto, amigável e conciso. Valores na moeda do retrato. Use listas curtas quando ajudar.",
    "Se o dado não estiver no retrato, diga que não tem essa informação — não invente números.",
    "Você NÃO dá aconselhamento financeiro profissional; ofereça observações e ideias práticas, sem recomendar investimentos.",
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
        temperature: 0.3,
        messages: [{ role: "system", content: system }, ...messages],
      }),
    });
  } catch {
    return json({ error: "ai_unreachable" }, 502);
  }
  if (!aiRes.ok) return json({ error: "ai_error", status: aiRes.status }, 502);
  let out: { choices?: { message?: { content?: string } }[] };
  try {
    out = await aiRes.json();
  } catch {
    return json({ error: "ai_bad_json" }, 502);
  }
  const reply = out.choices?.[0]?.message?.content?.trim() ?? "";
  if (!reply) return json({ error: "ai_empty" }, 502);
  return json({ reply });
}
