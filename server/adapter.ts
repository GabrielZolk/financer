/**
 * Ponte entre os handlers estilo Web (Request → Response) e a assinatura
 * (req, res) do runtime Node da Vercel.
 *
 * Por que existe: as functions em `api/` foram escritas no padrão Web/Fetch,
 * mas o runtime Node entrega objetos do `node:http` — `req.headers.get` não
 * existe lá e a function quebrava com 500 (FUNCTION_INVOCATION_FAILED).
 * O adapter converte na entrada e na saída, inclusive repassando streams
 * (o chat responde SSE token a token).
 */
import type { IncomingMessage, ServerResponse } from "node:http";

export type WebHandler = (req: Request) => Promise<Response>;

/** Lê o corpo cru, aceitando o body já parseado pelo runtime da Vercel. */
async function rawBody(req: IncomingMessage): Promise<string | undefined> {
  const pre = (req as IncomingMessage & { body?: unknown }).body;
  if (typeof pre === "string") return pre;
  if (pre && typeof pre === "object") return JSON.stringify(pre);
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : (chunk as Buffer));
  }
  if (!chunks.length) return undefined;
  return Buffer.concat(chunks).toString("utf8");
}

function toWebHeaders(req: IncomingMessage): Headers {
  const h = new Headers();
  for (const [k, v] of Object.entries(req.headers)) {
    if (v === undefined) continue;
    if (Array.isArray(v)) v.forEach((one) => h.append(k, one));
    else h.set(k, v);
  }
  return h;
}

export function toNode(handler: WebHandler) {
  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    try {
      const method = req.method ?? "GET";
      const host = (req.headers.host as string) || "localhost";
      const url = new URL(req.url ?? "/", `https://${host}`);
      const body =
        method === "GET" || method === "HEAD" ? undefined : await rawBody(req);

      const response = await handler(
        new Request(url, { method, headers: toWebHeaders(req), body }),
      );

      res.statusCode = response.status;
      response.headers.forEach((value, key) => {
        // content-encoding/length viriam da resposta upstream e não valem aqui
        if (key === "content-encoding" || key === "content-length") return;
        res.setHeader(key, value);
      });
      res.flushHeaders?.();

      if (!response.body) {
        res.end();
        return;
      }
      const reader = response.body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(Buffer.from(value));
      }
      res.end();
    } catch (e) {
      // nunca deixa a function estourar sem resposta (vira 500 opaco)
      const message = e instanceof Error ? e.message : "unknown";
      if (!res.headersSent) {
        res.statusCode = 500;
        res.setHeader("content-type", "application/json");
      }
      res.end(JSON.stringify({ error: "handler_failed", message }));
    }
  };
}
