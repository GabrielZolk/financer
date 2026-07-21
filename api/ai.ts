/**
 * Proxy serverless da IA (xAI/Grok) — Fase A: interpretar um lançamento em
 * linguagem natural ("gastei 54,90 no mercado ontem no débito") e devolver os
 * campos estruturados pro app pré-preencher o formulário.
 *
 * Segurança: a chave XAI_API_KEY vive SÓ aqui (server-side, sem prefixo VITE_).
 * Exige um token de sessão do Supabase (só usuário logado usa a IA).
 *
 * Env (Vercel → Settings → Environment Variables):
 *   XAI_API_KEY   — sua chave da API xAI (obrigatória p/ uso real)
 *   XAI_MODEL     — modelo (padrão "grok-4-fast"); ajuste pro modelo que você usa
 *   AI_MOCK=1     — devolve um resultado FALSO (heurístico), sem chamar a xAI —
 *                   use pra testar o fluxo sem gastar créditos
 *   (SUPABASE_URL / SUPABASE_ANON_KEY são lidos, com fallback pros VITE_*)
 */

export const config = { runtime: "nodejs" };

interface ParsedTx {
  kind: "expense" | "income";
  amountCents: number;
  description: string;
  categoryId: string | null;
  accountId: string | null;
  date: string; // YYYY-MM-DD
}
interface NamedRef {
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

  // 1) autenticação: valida o token do Supabase (só logado usa a IA)
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

  // 2) corpo
  let body: {
    text?: string;
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
  const text = (body.text || "").trim();
  if (!text) return json({ error: "no_text" }, 400);
  const today = body.today || new Date().toISOString().slice(0, 10);
  const accounts = body.accounts ?? [];
  const categories = body.categories ?? [];

  // 3) modo mock (não chama a xAI — testar sem gastar créditos)
  if (env("AI_MOCK") === "1") {
    return json(mockParse(text, today, accounts, categories));
  }

  // 4) chamada real à xAI
  const key = env("XAI_API_KEY");
  if (!key) return json({ error: "ai_not_configured" }, 503);
  const model = env("XAI_MODEL") || "grok-4-fast";

  const system = buildSystemPrompt(today, body.currency || "BRL", accounts, categories);
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
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: text },
        ],
      }),
    });
  } catch {
    return json({ error: "ai_unreachable" }, 502);
  }
  if (!aiRes.ok) {
    return json({ error: "ai_error", status: aiRes.status }, 502);
  }
  let out: { choices?: { message?: { content?: string } }[] };
  try {
    out = await aiRes.json();
  } catch {
    return json({ error: "ai_bad_json" }, 502);
  }
  const content = out.choices?.[0]?.message?.content ?? "{}";
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(content);
  } catch {
    return json({ error: "ai_parse" }, 502);
  }
  return json(sanitize(raw, today, accounts, categories));
}

function buildSystemPrompt(
  today: string,
  currency: string,
  accounts: NamedRef[],
  categories: NamedRef[],
): string {
  const accList = accounts.map((a) => `${a.id}=${a.name}`).join("; ") || "(nenhuma)";
  const catList =
    categories.map((c) => `${c.id}=${c.name} (${c.kind ?? "?"})`).join("; ") ||
    "(nenhuma)";
  return [
    "Você extrai UM lançamento financeiro a partir de um texto em linguagem natural (pt-BR).",
    `Hoje é ${today}. Moeda: ${currency}.`,
    "Responda SÓ com um objeto JSON com estas chaves:",
    '{"kind":"expense"|"income","amountCents":inteiro,"description":string,"categoryId":string|null,"accountId":string|null,"date":"YYYY-MM-DD"}',
    "Regras:",
    "- amountCents = valor em centavos (ex.: 54,90 -> 5490). Sem sinal.",
    '- kind: "gastei/paguei/comprei" => expense; "recebi/ganhei/salário/entrou" => income. Padrão: expense.',
    "- date: entenda 'hoje', 'ontem', 'anteontem', datas relativas. Padrão: hoje.",
    "- description: um rótulo curto (ex.: 'Mercado'), sem o valor.",
    `- accountId: escolha SÓ entre estas contas (id=nome), senão null: ${accList}`,
    `- categoryId: escolha SÓ entre estas categorias (id=nome(tipo)), senão null: ${catList}`,
    "Não invente ids. Se não tiver certeza, use null.",
  ].join("\n");
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
  const description =
    typeof raw.description === "string" && raw.description.trim()
      ? raw.description.trim().slice(0, 120)
      : "";
  const accountId =
    typeof raw.accountId === "string" && accounts.some((a) => a.id === raw.accountId)
      ? raw.accountId
      : null;
  const categoryId =
    typeof raw.categoryId === "string" &&
    categories.some((c) => c.id === raw.categoryId)
      ? raw.categoryId
      : null;
  const date =
    typeof raw.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw.date)
      ? raw.date
      : today;
  return { kind, amountCents: cents, description, categoryId, accountId, date };
}

/** Heurística simples pro modo mock (sem IA). */
function mockParse(
  text: string,
  today: string,
  accounts: NamedRef[],
  categories: NamedRef[],
): ParsedTx {
  const low = text.toLowerCase();
  const income = /\b(recebi|ganhei|sal[áa]rio|entrou|pix recebido)\b/.test(low);
  const m = low.match(/(\d+(?:[.,]\d{1,2})?)/);
  const amountCents = m
    ? Math.round(parseFloat(m[1].replace(".", "").replace(",", ".")) * 100)
    : 0;
  let date = today;
  if (/\bontem\b/.test(low)) date = shiftDay(today, -1);
  else if (/\banteontem\b/.test(low)) date = shiftDay(today, -2);
  const cat = categories.find((c) => low.includes(c.name.toLowerCase()));
  const acc = accounts.find((a) => low.includes(a.name.toLowerCase()));
  return {
    kind: income ? "income" : "expense",
    amountCents,
    description: (cat?.name ?? text).slice(0, 120),
    categoryId: cat?.id ?? null,
    accountId: acc?.id ?? null,
    date,
  };
}

function shiftDay(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
