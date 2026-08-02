import { describe, it, expect } from "vitest";
import type { IncomingMessage, ServerResponse } from "node:http";
import { toNode } from "./adapter";
import chatHandler from "../api/chat";

function fakeReq(o: {
  method?: string;
  url?: string;
  headers?: Record<string, string>;
  body?: string;
}): IncomingMessage {
  const req = {
    method: o.method ?? "GET",
    url: o.url ?? "/api/test",
    headers: { host: "app.example", ...(o.headers ?? {}) },
    async *[Symbol.asyncIterator]() {
      if (o.body) yield Buffer.from(o.body);
    },
  };
  return req as unknown as IncomingMessage;
}

interface FakeRes extends ServerResponse {
  _chunks: Buffer[];
  _headers: Record<string, string>;
  text(): string;
}

function fakeRes(): FakeRes {
  const res = {
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
    write(c: Uint8Array | string) {
      this._chunks.push(Buffer.from(c as Uint8Array));
      return true;
    },
    end(c?: Uint8Array | string) {
      if (c) this._chunks.push(Buffer.from(c as Uint8Array));
    },
    text() {
      return Buffer.concat(this._chunks).toString("utf8");
    },
  };
  return res as unknown as FakeRes;
}

describe("toNode — ponte (req,res) do Node ↔ handler Web", () => {
  it("entrega método, headers e corpo pro handler estilo Request", async () => {
    let seen: { method: string; auth: string | null; body: unknown } | null = null;
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
    await handler(
      fakeReq({
        method: "POST",
        headers: { authorization: "Bearer abc" },
        body: JSON.stringify({ hi: 1 }),
      }),
      res,
    );

    expect(seen).toEqual({
      method: "POST",
      auth: "Bearer abc",
      body: { hi: 1 },
    });
    expect(res.statusCode).toBe(201);
    expect(res._headers["content-type"]).toBe("application/json");
    expect(res.text()).toBe('{"ok":true}');
  });

  it("aceita o corpo já parseado pelo runtime (req.body)", async () => {
    const handler = toNode(async (req) => Response.json(await req.json()));
    const req = fakeReq({ method: "POST" });
    (req as IncomingMessage & { body?: unknown }).body = { pre: "parsed" };
    const res = fakeRes();
    await handler(req, res);
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
    await handler(fakeReq({ method: "POST" }), res);
    expect(res._headers["content-type"]).toBe("text/event-stream");
    expect(res._chunks.length).toBe(2);
    expect(res.text()).toBe("data: um\n\ndata: dois\n\n");
  });

  it("erro no handler vira 500 com corpo JSON, não crash da function", async () => {
    const handler = toNode(async () => {
      throw new Error("boom");
    });
    const res = fakeRes();
    await handler(fakeReq({ method: "POST" }), res);
    expect(res.statusCode).toBe(500);
    expect(res.text()).toContain("handler_failed");
  });
});

describe("api/chat com a assinatura real do runtime Node", () => {
  it("responde 405 em GET (sem estourar req.headers.get)", async () => {
    const res = fakeRes();
    await chatHandler(fakeReq({ method: "GET" }), res);
    expect(res.statusCode).toBe(405);
  });

  it("responde 401 sem token", async () => {
    const res = fakeRes();
    await chatHandler(
      fakeReq({ method: "POST", body: JSON.stringify({ messages: [] }) }),
      res,
    );
    expect(res.statusCode).toBe(401);
    expect(res.text()).toContain("unauthorized");
  });
});
