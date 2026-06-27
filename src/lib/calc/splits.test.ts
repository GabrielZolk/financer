import { describe, it, expect } from "vitest";
import type { Transaction } from "@/db/types";
import { totalsByCategory } from "./cashflow";
import { budgetStatus } from "./budget";
import type { Budget } from "@/db/types";

function tx(over: Partial<Transaction>): Transaction {
  return {
    id: Math.random().toString(36),
    userId: "local",
    createdAt: "x",
    updatedAt: "x",
    deleted: 0,
    dirty: 0,
    accountId: "a",
    categoryId: null,
    kind: "expense",
    amountCents: 0,
    currency: "BRL",
    date: "2026-06-10",
    description: "",
    tags: [],
    status: "cleared",
    ...over,
  };
}

describe("lançamento dividido (splits)", () => {
  // Mercado R$500 = Bebida 300 + Pizza 100 + Carne 100
  const mercado = tx({
    amountCents: 50000,
    categoryId: null,
    splits: [
      { categoryId: "bebida", amountCents: 30000 },
      { categoryId: "pizza", amountCents: 10000 },
      { categoryId: "carne", amountCents: 10000 },
    ],
  });

  it("atribui cada parte à sua categoria em totalsByCategory", () => {
    const totals = totalsByCategory([mercado], "expense");
    const byId = Object.fromEntries(totals.map((t) => [t.categoryId, t.total]));
    expect(byId["bebida"]).toBe(30000);
    expect(byId["pizza"]).toBe(10000);
    expect(byId["carne"]).toBe(10000);
    // nada cai numa categoria "Mercado" genérica
    expect(byId["null"]).toBeUndefined();
  });

  it("orçamento conta só a fatia da categoria", () => {
    const budget: Budget = {
      id: "b",
      userId: "local",
      createdAt: "x",
      updatedAt: "x",
      deleted: 0,
      dirty: 0,
      categoryId: "bebida",
      month: "2026-06",
      limitCents: 50000,
    };
    const s = budgetStatus(budget, [mercado]);
    expect(s.spentCents).toBe(30000); // só a bebida, não os 500
  });

  it("transação normal (sem splits) continua usando categoryId", () => {
    const normal = tx({ amountCents: 2000, categoryId: "uber" });
    const totals = totalsByCategory([normal], "expense");
    expect(totals[0]).toEqual({ categoryId: "uber", total: 2000 });
  });
});
