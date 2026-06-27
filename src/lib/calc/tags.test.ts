import { describe, it, expect } from "vitest";
import {
  computeTagStats,
  sortTagStats,
  findDuplicatePairs,
  looksDuplicate,
  lastMonths,
} from "./tags";
import type { Transaction } from "@/db/types";

function tx(p: Partial<Transaction>): Transaction {
  return {
    id: p.id ?? Math.random().toString(36).slice(2),
    userId: "local",
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-01T00:00:00.000Z",
    deleted: 0,
    dirty: 0,
    accountId: p.accountId ?? "acc1",
    categoryId: null,
    kind: p.kind ?? "expense",
    amountCents: p.amountCents ?? 0,
    currency: "BRL",
    date: p.date ?? "2026-06-10",
    description: "",
    tags: p.tags ?? [],
    status: "cleared",
    ...p,
  } as Transaction;
}

const REF = new Date(2026, 5, 15); // jun/2026

describe("computeTagStats", () => {
  it("conta lançamentos e soma despesa por tag (nível base)", () => {
    const stats = computeTagStats(
      [
        tx({ tags: ["mercado"], amountCents: 1000, date: "2026-06-01" }),
        tx({ tags: ["mercado", "lazer"], amountCents: 500, date: "2026-06-05" }),
      ],
      REF,
    );
    const mercado = stats.find((s) => s.tag === "mercado")!;
    expect(mercado.count).toBe(2);
    expect(mercado.totalCents).toBe(1500);
    const lazer = stats.find((s) => s.tag === "lazer")!;
    expect(lazer.count).toBe(1);
    expect(lazer.totalCents).toBe(500);
  });

  it("atribui pelos itens da divisão quando a tag não está no base", () => {
    const stats = computeTagStats(
      [
        tx({
          tags: [],
          amountCents: 1000,
          splits: [
            { categoryId: null, amountCents: 700, tags: ["bebida"] },
            { categoryId: null, amountCents: 300, tags: ["pizza"] },
          ],
        }),
      ],
      REF,
    );
    expect(stats.find((s) => s.tag === "bebida")!.totalCents).toBe(700);
    expect(stats.find((s) => s.tag === "pizza")!.totalCents).toBe(300);
  });

  it("não conta receita/transferência como gasto, mas conta uso", () => {
    const stats = computeTagStats(
      [tx({ kind: "income", tags: ["bonus"], amountCents: 9999 })],
      REF,
    );
    const bonus = stats.find((s) => s.tag === "bonus")!;
    expect(bonus.count).toBe(1);
    expect(bonus.totalCents).toBe(0);
  });

  it("ignora deletados e registra primeiro uso + contas", () => {
    const stats = computeTagStats(
      [
        tx({ tags: ["x"], amountCents: 100, date: "2026-06-10", accountId: "a" }),
        tx({ tags: ["x"], amountCents: 100, date: "2026-05-01", accountId: "b" }),
        tx({ tags: ["x"], amountCents: 100, deleted: 1 }),
      ],
      REF,
    );
    const x = stats.find((s) => s.tag === "x")!;
    expect(x.count).toBe(2);
    expect(x.firstUse).toBe("2026-05-01");
    expect(x.accountIds.sort()).toEqual(["a", "b"]);
  });

  it("série mensal cobre 6 meses (antigo→recente)", () => {
    const months = lastMonths(6, REF);
    expect(months).toEqual([
      "2026-01",
      "2026-02",
      "2026-03",
      "2026-04",
      "2026-05",
      "2026-06",
    ]);
    const stats = computeTagStats(
      [tx({ tags: ["y"], amountCents: 250, date: "2026-06-09" })],
      REF,
    );
    expect(stats.find((s) => s.tag === "y")!.monthly[5]).toBe(250);
  });
});

describe("sortTagStats", () => {
  const base = computeTagStats(
    [
      tx({ tags: ["a"], amountCents: 100 }),
      tx({ tags: ["b"], amountCents: 100 }),
      tx({ tags: ["b"], amountCents: 9000 }),
    ],
    REF,
  );
  it("ordena por uso e por total", () => {
    expect(sortTagStats(base, "uses")[0].tag).toBe("b");
    expect(sortTagStats(base, "total")[0].tag).toBe("b");
    expect(sortTagStats(base, "alpha")[0].tag).toBe("a");
  });
});

describe("duplicatas", () => {
  it("detecta caixa/acento, prefixo e 1 caractere", () => {
    expect(looksDuplicate("mercado", "Mercado")).toBe(true);
    expect(looksDuplicate("merc", "mercado")).toBe(true);
    expect(looksDuplicate("saude", "saúde")).toBe(true);
    expect(looksDuplicate("lazer", "laser")).toBe(true);
    expect(looksDuplicate("casa", "carro")).toBe(false);
  });

  it("retorna par com a mais usada primeiro", () => {
    const stats = computeTagStats(
      [
        tx({ tags: ["mercado"], amountCents: 1 }),
        tx({ tags: ["mercado"], amountCents: 1 }),
        tx({ tags: ["merc"], amountCents: 1 }),
      ],
      REF,
    );
    const pairs = findDuplicatePairs(stats);
    expect(pairs).toContainEqual(["mercado", "merc"]);
  });
});
