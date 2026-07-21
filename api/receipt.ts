/**
 * Proxy serverless — foto de cupom (Grok vision): lê a imagem de uma nota/cupom
 * e devolve os campos do lançamento pro app pré-preencher o formulário.
 * Mesma segurança do /api/ai. AI_MOCK=1 devolve um exemplo (sem chamar a xAI).
 */

export const config = { runtime: "nodejs" };

interface NamedRef {
  id: string;
  name: string;
  kind?: string;
}
interface ParsedTx {
  kind: "expense" | "income";
  amountCents: number;
  description: string;
  categoryId: string | null;
  accountId: string | null;
  date: string;
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

  let body: {
    image?: string;
    today?: string;
    currency?: string;
    accounts?: NamedRef[];
    categories?: NamedRef[];
  };
  try {
    body = await req.json();
  } catch {
    return json({ error: "bad_body" }, 400);
  }
  const image = body.image || "";
  if (!/^data:image\//.test(image)) return json({ error: "no_image" }, 400);
  const today = body.today || new Date().toISOString().slice(0, 10);
  const accounts = body.accounts ?? [];
  const categories = body.categories ?? [];

  if (env("AI_MOCK") === "1") {
    return json({
      kind: "expense",
      amountCents: 5490,
      description: "Cupom (teste)",
      categoryId: null,
      accountId: null,
      date: today,
    } as ParsedTx);
  }

  const key = env("XAI_API_KEY");
  if (!key) return json({ error: "ai_not_configured" }, 503);
  const model = env("XAI_MODEL") || "grok-4-fast";

  const accList = accounts.map((a) => `${a.id}=${a.name}`).join("; ") || "(nenhuma)";
  const catList =
    categories.map((c) => `${c.id}=${c.name} (${c.kind ?? "?"})`).join("; ") ||
    "(nenhuma)";
  const prompt = [
    "Extraia UM lançamento financeiro desta foto de cupom/nota fiscal (pt-BR).",
    `Hoje é ${today}. Moeda: ${body.currency || "BRL"}.`,
    'Responda SÓ JSON: {"kind":"expense"|"income","amountCents":inteiro,"description":string,"categoryId":string|null,"accountId":string|null,"date":"YYYY-MM-DD"}',
    "- amountCents = VALOR TOTAL em centavos.",
    "- description = nome do estabelecimento/loja.",
    "- date = data do cupom (YYYY-MM-DD); se não achar, use hoje.",
    "- kind: quase sempre expense.",
    `- accountId: só destas contas, senão null: ${accList}`,
    `- categoryId: só destas categorias, senão null: ${catList}`,
    "Não invente ids. Se não conseguir ler o total, amountCents = 0.",
  ].join("\n");

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
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              { type: "image_url", image_url: { url: image } },
            ],
          },
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
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(out.choices?.[0]?.message?.content ?? "{}");
  } catch {
    return json({ error: "ai_parse" }, 502);
  }
  return json(sanitize(raw, today, accounts, categories));
}

function sanitize(
  raw: Record<string, unknown>,
  today: string,
  accounts: NamedRef[],
  categories: NamedRef[],
): ParsedTx {
  const kind = raw.kind === "income" ? "income" : "expense";
  let cents = Number(raw.amountCents);
  if (!Number.isFinite(cents) || cents < 0) cents = 0;
  cents = Math.round(cents);
  return {
    kind,
    amountCents: cents,
    description:
      typeof raw.description === "string" && raw.description.trim()
        ? raw.description.trim().slice(0, 120)
        : "",
    accountId:
      typeof raw.accountId === "string" && accounts.some((a) => a.id === raw.accountId)
        ? raw.accountId
        : null,
    categoryId:
      typeof raw.categoryId === "string" &&
      categories.some((c) => c.id === raw.categoryId)
        ? raw.categoryId
        : null,
    date:
      typeof raw.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw.date)
        ? raw.date
        : today,
  };
}
