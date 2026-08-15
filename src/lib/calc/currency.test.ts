import { describe, it, expect } from "vitest";
import { toBaseCurrency } from "./currency";
import { cashflow } from "./cashflow";
import type { Transaction } from "@/db/types";

let n = 0;
const tx = (
  amountCents: number,
  currency: string,
  extra: Partial<Transaction> = {},
): Transaction => ({
  id: `t${++n}`,
  userId: "u",
  createdAt: "2026-01-01",
  updatedAt: "2026-01-01",
  deleted: 0,
  dirty: 0,
  accountId: "a1",
  toAccountId: null,
  categoryId: "c1",
  kind: "expense",
  amountCents,
  currency,
  date: "2026-08-10",
  description: "x",
  tags: [],
  status: "cleared",
  ...extra,
});

// 1 USD = 5,50 BRL
const rate = (c: string) => (c === "USD" ? 5.5 : 1);

describe("toBaseCurrency", () => {
  it("converte o que está em outra moeda", () => {
    const [brl, usd] = toBaseCurrency(
      [tx(10_000, "BRL"), tx(10_000, "USD")],
      "BRL",
      rate,
    );
    expect(brl.amountCents).toBe(10_000);
    expect(usd.amountCents).toBe(55_000);
    expect(usd.currency).toBe("BRL");
  });

  it("devolve a MESMA lista quando não há o que converter", () => {
    const list = [tx(10_000, "BRL"), tx(500, "BRL")];
    expect(toBaseCurrency(list, "BRL", rate)).toBe(list);
  });

  it("sem cotação cadastrada, não inventa valor (fator 1)", () => {
    const [only] = toBaseCurrency([tx(10_000, "JPY")], "BRL", rate);
    expect(only.amountCents).toBe(10_000);
  });

  it("converte também os itens da divisão (split)", () => {
    const [conv] = toBaseCurrency(
      [
        tx(10_000, "USD", {
          splits: [
            { categoryId: "c1", amountCents: 6_000, unitAmountCents: 3_000 },
            { categoryId: "c2", amountCents: 4_000 },
          ],
        }),
      ],
      "BRL",
      rate,
    );
    expect(conv.splits?.[0].amountCents).toBe(33_000);
    expect(conv.splits?.[0].unitAmountCents).toBe(16_500);
    expect(conv.splits?.[1].amountCents).toBe(22_000);
  });

  it("corrige a soma de fluxo que antes misturava moedas", () => {
    const list = [tx(10_000, "BRL"), tx(10_000, "USD")];
    expect(cashflow(list).expense).toBe(20_000); // errado: soma direta
    expect(cashflow(toBaseCurrency(list, "BRL", rate)).expense).toBe(65_000);
  });
});
