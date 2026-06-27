import { describe, it, expect } from "vitest";
import { resolveBudgets } from "./budget";
import type { Budget } from "@/db/types";

function b(p: Partial<Budget>): Budget {
  return {
    id: p.id ?? Math.random().toString(36).slice(2),
    userId: "local",
    createdAt: "",
    updatedAt: "",
    deleted: 0,
    dirty: 0,
    categoryId: p.categoryId ?? "cat",
    month: p.month ?? "2026-06",
    limitCents: p.limitCents ?? 10000,
    recurring: p.recurring,
  } as Budget;
}

describe("resolveBudgets", () => {
  it("recorrente vale nos meses seguintes", () => {
    const all = [b({ id: "r", categoryId: "merc", month: "2026-05", limitCents: 50000, recurring: 1 })];
    const jun = resolveBudgets(all, "2026-06");
    expect(jun).toHaveLength(1);
    expect(jun[0].id).toBe("r");
    expect(jun[0].month).toBe("2026-06"); // ajustado pro mês alvo
    expect(jun[0].limitCents).toBe(50000);
  });

  it("recorrente NÃO aparece antes do mês de início", () => {
    const all = [b({ month: "2026-06", recurring: 1 })];
    expect(resolveBudgets(all, "2026-05")).toHaveLength(0);
  });

  it("explícito do mês sobrescreve o recorrente", () => {
    const all = [
      b({ id: "r", categoryId: "merc", month: "2026-01", limitCents: 50000, recurring: 1 }),
      b({ id: "o", categoryId: "merc", month: "2026-06", limitCents: 80000, recurring: 0 }),
    ];
    const jun = resolveBudgets(all, "2026-06");
    expect(jun).toHaveLength(1);
    expect(jun[0].id).toBe("o");
    expect(jun[0].limitCents).toBe(80000);
  });

  it("pega o recorrente mais recente por categoria", () => {
    const all = [
      b({ id: "old", categoryId: "merc", month: "2026-01", limitCents: 30000, recurring: 1 }),
      b({ id: "new", categoryId: "merc", month: "2026-04", limitCents: 60000, recurring: 1 }),
    ];
    const jun = resolveBudgets(all, "2026-06");
    expect(jun).toHaveLength(1);
    expect(jun[0].id).toBe("new");
  });

  it("orçamento de mês único (não-recorrente) só aparece no próprio mês", () => {
    const all = [b({ month: "2026-06", recurring: 0 })];
    expect(resolveBudgets(all, "2026-06")).toHaveLength(1);
    expect(resolveBudgets(all, "2026-07")).toHaveLength(0);
  });
});
