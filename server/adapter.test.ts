import { describe, it, expect } from "vitest";
// o adapter vive INLINE em cada function (a Vercel não empacota imports de
// fora de api/) — importamos o de api/chat, que é o mesmo código dos 5.
import chatHandler, { toNode } from "../api/chat";
import aiHandler from "../api/ai";
import categorizeHandler from "../api/categorize";
import insightsHandler from "../api/insights";
import receiptHandler from "../api/receipt";

type AnyHandler = (req: never, res: never) => Promise<void>;

function fakeReq(o: {
  method?: string;
  url?: string;
  headers?: Record<string, string>;
  body?: string;
}) {
  return {
    method: o.method ?? "GET",
    url: o.url ?? "/api/test",
    headers: { host: "app.example", ...(o.headers ?? {}) },
    async *[Symbol.asyncIterator]() {
      if (o.body) yield Buffer.from(o.body);
    },
  };
}

function fakeRes() {
  return {
    statusCode: 0,
    headersSent: false,
    _chunks: [] as Buffer[],
    _headers: {} as Record<string, string>,
    setHeader(k: string, v: string) {
      this._headers[k] = v;
    },
    flushHeaders() {
      this.headersSent = true;
    },
    write(c: Uint8Array) {
      this._chunks.push(Buffer.from(c));
      return true;
    },
    end(c?: Uint8Array | string) {
      if (c) this._chunks.push(Buffer.from(c as Uint8Array));
    },
    text() {
      return Buffer.concat(this._chunks).toString("utf8");
    },
  };
}

type Req = ReturnType<typeof fakeReq>;
type Res = ReturnType<typeof fakeRes>;
const call = (h: unknown, req: Req, res: Res) =>
  (h as (a: Req, b: Res) => Promise<void>)(req, res);

describe("toNode — ponte (req,res) do Node ↔ handler Web", () => {
  it("entrega método, headers e corpo pro handler estilo Request", async () => {
    let seen: unknown = null;
    const handler = toNode(async (req) => {
      seen = {
        method: req.method,
        auth: req.headers.get("authorization"),
        body: await req.json(),
      };
      return new Response(JSON.stringify({ ok: true }), {
        status: 201,
        headers: { "content-type": "application/json" },
      });
    });

    const res = fakeRes();
    await call(
      handler,
      fakeReq({
        method: "POST",
        headers: { authorization: "Bearer abc" },
        body: JSON.stringify({ hi: 1 }),
      }),
      res,
    );

    expect(seen).toEqual({ method: "POST", auth: "Bearer abc", body: { hi: 1 } });
    expect(res.statusCode).toBe(201);
    expect(res._headers["content-type"]).toBe("application/json");
    expect(res.text()).toBe('{"ok":true}');
  });

  it("aceita o corpo já parseado pelo runtime (req.body)", async () => {
    const handler = toNode(async (req) => Response.json(await req.json()));
    const req = { ...fakeReq({ method: "POST" }), body: { pre: "parsed" } };
    const res = fakeRes();
    await call(handler, req as unknown as Req, res);
    expect(res.text()).toBe('{"pre":"parsed"}');
  });

  it("repassa stream (SSE) em pedaços", async () => {
    const handler = toNode(async () => {
      const body = new ReadableStream<Uint8Array>({
        start(c) {
          const e = new TextEncoder();
          c.enqueue(e.encode("data: um\n\n"));
          c.enqueue(e.encode("data: dois\n\n"));
          c.close();
        },
      });
      return new Response(body, {
        headers: { "content-type": "text/event-stream" },
      });
    });
    const res = fakeRes();
    await call(handler, fakeReq({ method: "POST" }), res);
    expect(res._headers["content-type"]).toBe("text/event-stream");
    expect(res._chunks.length).toBe(2);
    expect(res.text()).toBe("data: um\n\ndata: dois\n\n");
  });

  it("erro no handler vira 500 com corpo JSON, não crash da function", async () => {
    const handler = toNode(async () => {
      throw new Error("boom");
    });
    const res = fakeRes();
    await call(handler, fakeReq({ method: "POST" }), res);
    expect(res.statusCode).toBe(500);
    expect(res.text()).toContain("handler_failed");
  });
});

// guarda contra a regressão que quebrou a produção: os 5 endpoints precisam
// aceitar a assinatura (req,res) do Node sem estourar em req.headers.get
const ENDPOINTS: [string, unknown][] = [
  ["ai", aiHandler],
  ["chat", chatHandler],
  ["categorize", categorizeHandler],
  ["insights", insightsHandler],
  ["receipt", receiptHandler],
];

describe.each(ENDPOINTS)("api/%s com a assinatura real do Node", (_name, h) => {
  it("405 em GET", async () => {
    const res = fakeRes();
    await call(h as AnyHandler, fakeReq({ method: "GET" }), res);
    expect(res.statusCode).toBe(405);
  });

  it("401 em POST sem token", async () => {
    const res = fakeRes();
    await call(h as AnyHandler, fakeReq({ method: "POST", body: "{}" }), res);
    expect(res.statusCode).toBe(401);
    expect(res.text()).toContain("unauthorized");
  });
});
