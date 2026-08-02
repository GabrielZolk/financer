import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      getSession: async () => ({ data: { session: { access_token: "tok" } } }),
    },
  },
}));

import { askAssistant } from "./aiChat";
import type { ActionCtx } from "./aiActions";
import type { FinancialSnapshot } from "./aiSnapshot";

const ctx: ActionCtx = {
  accounts: [{ id: "a1", name: "Itaú", archived: 0 }],
  categories: [{ id: "c1", name: "Alimentação", kind: "expense" }],
  today: "2026-08-02",
};
const snap = { currency: "BRL" } as FinancialSnapshot;

/** Monta uma resposta SSE como a da xAI a partir dos deltas informados. */
function sseResponse(deltas: unknown[]): Response {
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      const enc = new TextEncoder();
      for (const d of deltas)
        c.enqueue(
          enc.encode(`data: ${JSON.stringify({ choices: [{ delta: d }] })}\n\n`),
        );
      c.enqueue(enc.encode("data: [DONE]\n\n"));
      c.close();
    },
  });
  return new Response(body, {
    status: 200,
    headers: { "content-type": "text/event-stream" },
  });
}

beforeEach(() => vi.unstubAllGlobals());

describe("askAssistant — streaming", () => {
  it("acumula o texto e chama onToken com o total parcial", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        sseResponse([{ content: "Você " }, { content: "gastou " }, { content: "R$10." }]),
      ),
    );
    const seen: string[] = [];
    const r = await askAssistant([{ role: "user", content: "oi" }], snap, (f) =>
      seen.push(f),
    );
    expect(r.text).toBe("Você gastou R$10.");
    expect(seen).toEqual(["Você ", "Você gastou ", "Você gastou R$10."]);
    expect(r.action).toBeNull();
  });

  it("junta os pedaços de arguments do tool_call e devolve a ação", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        sseResponse([
          { content: "Posso criar:" },
          { tool_calls: [{ index: 0, function: { name: "criar_meta", arguments: '{"nome"' } }] },
          { tool_calls: [{ index: 0, function: { arguments: ':"Carro","valorAlvo"' } }] },
          { tool_calls: [{ index: 0, function: { arguments: ":5000}" } }] },
        ]),
      ),
    );
    const r = await askAssistant([{ role: "user", content: "cria meta" }], snap, undefined, ctx);
    expect(r.text).toBe("Posso criar:");
    expect(r.action).toEqual({
      type: "goal",
      name: "Carro",
      targetCents: 500000,
      deadline: null,
    });
  });

  it("ignora o tool_call quando o contexto não foi passado", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        sseResponse([
          { tool_calls: [{ index: 0, function: { name: "criar_meta", arguments: '{"nome":"X","valorAlvo":1}' } }] },
        ]),
      ),
    );
    const r = await askAssistant([{ role: "user", content: "x" }], snap);
    expect(r.action).toBeNull();
  });

  it("modo mock (JSON) também entrega ação", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              reply: "(teste)",
              action: { name: "criar_meta", args: { nome: "Y", valorAlvo: 20 } },
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          ),
      ),
    );
    const r = await askAssistant([{ role: "user", content: "x" }], snap, undefined, ctx);
    expect(r.text).toBe("(teste)");
    expect(r.action).toMatchObject({ type: "goal", targetCents: 2000 });
  });

  it("erro do servidor vira AiError com o código", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ error: "ai_not_configured" }), {
            status: 503,
            headers: { "content-type": "application/json" },
          }),
      ),
    );
    await expect(
      askAssistant([{ role: "user", content: "x" }], snap),
    ).rejects.toMatchObject({ code: "ai_not_configured" });
  });
});
