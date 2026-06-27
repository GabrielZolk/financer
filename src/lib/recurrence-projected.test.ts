import { describe, it, expect } from "vitest";
import { projectedNet, lastDayOfMonth } from "./recurrence";
import type { Recurrence } from "@/db/types";

function rec(p: Partial<Recurrence>): Recurrence {
  return {
    id: Math.random().toString(36).slice(2),
    userId: "local",
    createdAt: "",
    updatedAt: "",
    deleted: 0,
    dirty: 0,
    description: "x",
    kind: p.kind ?? "expense",
    amountCents: p.amountCents ?? 5000,
    accountId: "acc",
    categoryId: null,
    frequency: p.frequency ?? "monthly",
    nextDate: p.nextDate ?? "2026-06-25",
    active: p.active ?? 1,
    ...p,
  } as Recurrence;
}

describe("lastDayOfMonth", () => {
  it("calcula o último dia", () => {
    expect(lastDayOfMonth("2026-02")).toBe("2026-02-28");
    expect(lastDayOfMonth("2026-06")).toBe("2026-06-30");
  });
});

describe("projectedNet", () => {
  const TODAY = "2026-06-21";
  const END = "2026-06-30";

  it("receita futura entra positiva, despesa negativa", () => {
    const net = projectedNet(
      [
        rec({ kind: "income", amountCents: 300000, nextDate: "2026-06-25" }),
        rec({ kind: "expense", amountCents: 5000, nextDate: "2026-06-26" }),
      ],
      END,
      TODAY,
    );
    expect(net).toBe(295000);
  });

  it("ignora inativas e transferências", () => {
    const net = projectedNet(
      [
        rec({ kind: "transfer", amountCents: 9999, nextDate: "2026-06-25" }),
        rec({ kind: "income", amountCents: 1000, nextDate: "2026-06-25", active: 0 }),
      ],
      END,
      TODAY,
    );
    expect(net).toBe(0);
  });

  it("não conta recorrência fora do período", () => {
    const net = projectedNet(
      [rec({ kind: "income", amountCents: 1000, nextDate: "2026-08-01" })],
      END,
      TODAY,
    );
    expect(net).toBe(0);
  });
});
