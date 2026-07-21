/**
 * Proxy serverless — Fase B: auto-categorizar em lote os lançamentos de um
 * extrato importado. Recebe as descrições + as categorias do usuário e devolve
 * um categoryId (ou null) pra cada item. Mesma segurança do /api/ai.
 * AI_MOCK=1 categoriza por palavra-chave (sem chamar a xAI).
 */

export const config = { runtime: "nodejs" };

interface Cat {
  id: string;
  name: string;
  kind?: string;
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

  let body: { items?: string[]; categories?: Cat[] };
  try {
    body = await req.json();
  } catch {
    return json({ error: "bad_body" }, 400);
  }
  const items = (body.items ?? []).slice(0, 300).map((s) => String(s));
  const categories = body.categories ?? [];
  if (!items.length) return json({ results: [] });
  const validIds = new Set(categories.map((c) => c.id));

  if (env("AI_MOCK") === "1") {
    return json({ results: items.map((d, i) => ({ i, categoryId: mockCat(d, categories) })) });
  }

  const key = env("XAI_API_KEY");
  if (!key) return json({ error: "ai_not_configured" }, 503);
  const model = env("XAI_MODEL") || "grok-4-fast";

  const catList = categories.map((c) => `${c.id}=${c.name} (${c.kind ?? "?"})`).join("; ");
  const system = [
    "Você classifica lançamentos bancários em categorias (pt-BR).",
    "Recebe uma lista numerada de descrições e uma lista de categorias (id=nome(tipo)).",
    'Responda SÓ com JSON: {"results":[{"i":indice,"categoryId":"id"|null}, ...]} — um item por descrição.',
    "Use SÓ ids da lista. Se nenhuma servir, categoryId null. Não invente ids.",
    `Categorias: ${catList}`,
  ].join("\n");
  const user =
    "Descrições:\n" + items.map((d, i) => `${i}: ${d}`).join("\n");

  let aiRes: Response;
  try {
    aiRes = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
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
  let raw: { results?: { i: number; categoryId: string | null }[] };
  try {
    raw = JSON.parse(out.choices?.[0]?.message?.content ?? "{}");
  } catch {
    return json({ error: "ai_parse" }, 502);
  }
  const results = (raw.results ?? [])
    .filter((r) => Number.isInteger(r.i) && r.i >= 0 && r.i < items.length)
    .map((r) => ({
      i: r.i,
      categoryId:
        typeof r.categoryId === "string" && validIds.has(r.categoryId)
          ? r.categoryId
          : null,
    }));
  return json({ results });
}

function mockCat(desc: string, categories: Cat[]): string | null {
  const low = desc.toLowerCase();
  const rules: [RegExp, string[]][] = [
    [/mercado|super|padaria|ifood|restaurante|lanche/, ["aliment", "comida", "mercado"]],
    [/uber|99|posto|gasolina|combust|onibus|metro/, ["transport", "carro"]],
    [/farm|drog|sa[úu]de|hospital/, ["sa[úu]de"]],
    [/netflix|spotify|assinatura|cinema/, ["lazer", "assinatur"]],
    [/luz|[áa]gua|internet|aluguel|condom/, ["moradia", "casa", "contas"]],
  ];
  for (const [re, names] of rules) {
    if (re.test(low)) {
      const cat = categories.find((c) =>
        names.some((n) => new RegExp(n).test(c.name.toLowerCase())),
      );
      if (cat) return cat.id;
    }
  }
  return null;
}
