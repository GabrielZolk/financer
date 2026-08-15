/**
 * Exclusão de CONTA (Fase 2 do "Zona de perigo").
 *
 * O SDK client consegue apagar os DADOS, mas não a própria linha em
 * `auth.users` — isso exige a service-role key, que só pode existir no
 * servidor. Este endpoint fecha esse buraco (LGPD Art. 18 e exigência de
 * "delete account" da Play Store).
 *
 * Ordem: valida o token do usuário -> descobre o id pelo PRÓPRIO token
 * (nunca aceita id vindo do corpo) -> apaga anexos no Storage -> apaga os
 * `records` -> apaga o usuário. Idempotente: rodar de novo em conta já
 * apagada devolve 401 (o token morre junto), o que o client trata como ok.
 *
 * Env necessária: SUPABASE_SERVICE_ROLE_KEY (server-side, NUNCA com VITE_).
 */

export const config = { runtime: "nodejs" };

/**
 * Ponte (req,res) do runtime Node da Vercel <-> handler estilo Web.
 * Fica INLINE de propósito: a Vercel compila cada arquivo de api/ isolado e
 * não empacota imports de fora da pasta — um módulo compartilhado sumia do
 * bundle (ERR_MODULE_NOT_FOUND em produção).
 * Mantido idêntico nos endpoints; testado em server/adapter.test.ts.
 */
type NodeReq = AsyncIterable<Buffer> & {
  method?: string;
  url?: string;
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
};
type NodeRes = {
  statusCode: number;
  headersSent: boolean;
  setHeader(k: string, v: string): void;
  flushHeaders?(): void;
  write(c: Uint8Array): boolean;
  end(c?: Uint8Array | string): void;
};

export function toNode(handler: (req: Request) => Promise<Response>) {
  return async (req: NodeReq, res: NodeRes): Promise<void> => {
    try {
      const method = req.method ?? "GET";
      const headers = new Headers();
      for (const [k, v] of Object.entries(req.headers)) {
        if (v === undefined) continue;
        if (Array.isArray(v)) v.forEach((one) => headers.append(k, one));
        else headers.set(k, v);
      }
      let body: string | undefined;
      if (method !== "GET" && method !== "HEAD") {
        if (typeof req.body === "string") body = req.body;
        else if (req.body && typeof req.body === "object")
          body = JSON.stringify(req.body);
        else {
          const chunks: Buffer[] = [];
          for await (const c of req)
            chunks.push(typeof c === "string" ? Buffer.from(c) : c);
          if (chunks.length) body = Buffer.concat(chunks).toString("utf8");
        }
      }
      const host = (req.headers.host as string) || "localhost";
      const url = new URL(req.url ?? "/", `https://${host}`);

      const out = await handler(new Request(url, { method, headers, body }));

      res.statusCode = out.status;
      out.headers.forEach((value, key) => {
        if (key === "content-encoding" || key === "content-length") return;
        res.setHeader(key, value);
      });
      res.flushHeaders?.();
      if (!out.body) {
        res.end();
        return;
      }
      const reader = out.body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(value);
      }
      res.end();
    } catch (e) {
      // nunca deixa a function morrer sem resposta (500 opaco)
      const message = e instanceof Error ? e.message : "unknown";
      if (!res.headersSent) {
        res.statusCode = 500;
        res.setHeader("content-type", "application/json");
      }
      res.end(JSON.stringify({ error: "handler_failed", message }));
    }
  };
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}
const env = (k: string) => process.env[k];

const BUCKET = "attachments";

/** Remove os anexos do usuário no Storage (ignora falhas: não bloqueia a exclusão). */
async function removeAttachments(
  supaUrl: string,
  service: string,
  userId: string,
): Promise<void> {
  const auth = { Authorization: `Bearer ${service}`, apikey: service };
  const list = await fetch(`${supaUrl}/storage/v1/object/list/${BUCKET}`, {
    method: "POST",
    headers: { ...auth, "content-type": "application/json" },
    body: JSON.stringify({ prefix: `${userId}/`, limit: 1000 }),
  });
  if (!list.ok) return;
  const files = (await list.json()) as { name?: string }[];
  const paths = files
    .map((f) => f.name)
    .filter((n): n is string => !!n)
    .map((n) => `${userId}/${n}`);
  if (!paths.length) return;
  await fetch(`${supaUrl}/storage/v1/object/${BUCKET}`, {
    method: "DELETE",
    headers: { ...auth, "content-type": "application/json" },
    body: JSON.stringify({ prefixes: paths }),
  });
}

async function handleRequest(req: Request): Promise<Response> {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const token = (req.headers.get("authorization") || "").replace(
    /^Bearer\s+/i,
    "",
  );
  if (!token) return json({ error: "unauthorized" }, 401);

  const supaUrl = env("SUPABASE_URL") || env("VITE_SUPABASE_URL");
  const anon = env("SUPABASE_ANON_KEY") || env("VITE_SUPABASE_ANON_KEY");
  if (!supaUrl || !anon) return json({ error: "server_misconfigured" }, 500);

  // 1) quem é o dono do token (o id NUNCA vem do corpo do request)
  let userId: string;
  try {
    const u = await fetch(`${supaUrl}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${token}`, apikey: anon },
    });
    if (!u.ok) return json({ error: "unauthorized" }, 401);
    const me = (await u.json()) as { id?: string };
    if (!me.id) return json({ error: "unauthorized" }, 401);
    userId = me.id;
  } catch {
    return json({ error: "auth_check_failed" }, 502);
  }

  const service = env("SUPABASE_SERVICE_ROLE_KEY");
  if (!service) return json({ error: "delete_not_configured" }, 503);
  const auth = { Authorization: `Bearer ${service}`, apikey: service };

  // 2) anexos no Storage (best-effort)
  try {
    await removeAttachments(supaUrl, service, userId);
  } catch {
    /* segue: o que importa é apagar conta + registros */
  }

  // 3) registros do usuário
  try {
    const del = await fetch(
      `${supaUrl}/rest/v1/records?user_id=eq.${encodeURIComponent(userId)}`,
      { method: "DELETE", headers: auth },
    );
    if (!del.ok) return json({ error: "records_delete_failed" }, 502);
  } catch {
    return json({ error: "records_delete_failed" }, 502);
  }

  // 4) a conta em si
  try {
    const del = await fetch(
      `${supaUrl}/auth/v1/admin/users/${encodeURIComponent(userId)}`,
      { method: "DELETE", headers: auth },
    );
    if (!del.ok && del.status !== 404)
      return json({ error: "user_delete_failed", status: del.status }, 502);
  } catch {
    return json({ error: "user_delete_failed" }, 502);
  }

  return json({ ok: true });
}

export default toNode(handleRequest);
