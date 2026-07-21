/**
 * Proxy serverless — Fase C: gera 3–4 observações curtas e úteis sobre as
 * finanças do usuário, a partir do retrato agregado (SEM lançamentos crus).
 * Mesma segurança do /api/ai. AI_MOCK=1 devolve insights de exemplo.
 */

export const config = { runtime: "nodejs" };

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}
const env = (k: string) => process.env[k];

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
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

  let body: { snapshot?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "bad_body" }, 400);
  }
  const snapshot = body.snapshot ?? {};

  if (env("AI_MOCK") === "1") {
    return json({
      insights: [
        "(modo teste) Suas saídas deste mês estão abaixo da média dos últimos meses.",
        "(modo teste) Alimentação é sua maior categoria no ano.",
        "(modo teste) Ligue a chave real da xAI pra insights de verdade.",
      ],
    });
  }

  const key = env("XAI_API_KEY");
  if (!key) return json({ error: "ai_not_configured" }, 503);
  const model = env("XAI_MODEL") || "grok-4-fast";

  const system = [
    "Você é um analista financeiro pessoal (pt-BR). A partir do retrato agregado (JSON), gere de 3 a 4 observações CURTAS, específicas e úteis.",
    "Cada observação: 1 frase, com número quando fizer sentido (tendência, comparação de meses, categoria que cresceu, risco de estourar orçamento, ritmo de meta).",
    "Baseie-se APENAS nos dados. Não invente números. Não recomende investimentos nem dê aconselhamento profissional.",
    'Responda SÓ com JSON: {"insights":["...","..."]}.',
    "Retrato (JSON):",
    JSON.stringify(snapshot),
  ].join("\n");

  let aiRes: Response;
  try {
    aiRes = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model,
        temperature: 0.4,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: "Gere as observações." },
        ],
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
  let raw: { insights?: unknown };
  try {
    raw = JSON.parse(out.choices?.[0]?.message?.content ?? "{}");
  } catch {
    return json({ error: "ai_parse" }, 502);
  }
  const insights = Array.isArray(raw.insights)
    ? raw.insights
        .filter((s): s is string => typeof s === "string" && s.trim().length > 0)
        .map((s) => s.trim().slice(0, 200))
        .slice(0, 4)
    : [];
  return json({ insights });
}
