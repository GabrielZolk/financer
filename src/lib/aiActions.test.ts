import { describe, it, expect } from "vitest";
import { parseToolCall, type ActionCtx } from "./aiActions";

const ctx: ActionCtx = {
  accounts: [
    { id: "a1", name: "Itaú", archived: 0 },
    { id: "a2", name: "Nubank", archived: 1 },
  ],
  categories: [
    { id: "c1", name: "Alimentação", kind: "expense" },
    { id: "c2", name: "Salário", kind: "income" },
  ],
  today: "2026-08-02",
};

const call = (name: string, args: unknown) =>
  parseToolCall(name, JSON.stringify(args), ctx);

describe("parseToolCall — meta", () => {
  it("converte valor em centavos", () => {
    expect(call("criar_meta", { nome: "Carro", valorAlvo: 5000 })).toEqual({
      type: "goal",
      name: "Carro",
      targetCents: 500000,
      deadline: null,
    });
  });

  it("aceita prazo só no formato ISO", () => {
    const ok = call("criar_meta", {
      nome: "Carro",
      valorAlvo: 100,
      dataAlvo: "2027-01-31",
    });
    const bad = call("criar_meta", {
      nome: "Carro",
      valorAlvo: 100,
      dataAlvo: "janeiro de 2027",
    });
    expect(ok).toMatchObject({ deadline: "2027-01-31" });
    expect(bad).toMatchObject({ deadline: null });
  });

  it("recusa valor inválido ou nome vazio", () => {
    expect(call("criar_meta", { nome: "Carro", valorAlvo: 0 })).toBeNull();
    expect(call("criar_meta", { nome: "  ", valorAlvo: 10 })).toBeNull();
    expect(call("criar_meta", { nome: "X", valorAlvo: "abc" })).toBeNull();
  });
});

describe("parseToolCall — orçamento", () => {
  it("casa categoria ignorando acento e caixa", () => {
    expect(
      call("criar_orcamento", { categoria: "alimentacao", valorLimite: 800 }),
    ).toEqual({
      type: "budget",
      categoryId: "c1",
      categoryName: "Alimentação",
      limitCents: 80000,
      month: "2026-08",
    });
  });

  it("recusa categoria inexistente (não inventa id)", () => {
    expect(
      call("criar_orcamento", { categoria: "Viagens", valorLimite: 800 }),
    ).toBeNull();
  });

  it("não usa categoria de receita", () => {
    expect(
      call("criar_orcamento", { categoria: "Salário", valorLimite: 100 }),
    ).toBeNull();
  });
});

describe("parseToolCall — lançamento", () => {
  it("resolve conta e categoria por nome", () => {
    expect(
      call("criar_lancamento", {
        tipo: "despesa",
        valor: 54.9,
        descricao: "Mercado",
        categoria: "Alimentação",
        conta: "Itaú",
        data: "2026-08-01",
      }),
    ).toEqual({
      type: "transaction",
      kind: "expense",
      amountCents: 5490,
      description: "Mercado",
      categoryId: "c1",
      accountId: "a1",
      date: "2026-08-01",
    });
  });

  it("ignora conta arquivada e usa hoje sem data", () => {
    const r = call("criar_lancamento", {
      tipo: "receita",
      valor: 10,
      descricao: "Freela",
      conta: "Nubank",
    });
    expect(r).toMatchObject({
      kind: "income",
      accountId: null,
      date: "2026-08-02",
    });
  });
});

describe("parseToolCall — robustez", () => {
  it("devolve null pra ferramenta desconhecida ou JSON quebrado", () => {
    expect(call("apagar_tudo", { x: 1 })).toBeNull();
    expect(parseToolCall("criar_meta", "{nome:", ctx)).toBeNull();
  });
});
