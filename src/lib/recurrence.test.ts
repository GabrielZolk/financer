import { describe, it, expect } from "vitest";
import { nextOccurrence, generateDueTransactions } from "./recurrence";
import type { Recurrence } from "@/db/types";

function rec(over: Partial<Recurrence>): Recurrence {
  return {
    id: "r1",
    userId: "local",
    createdAt: "x",
    updatedAt: "x",
    deleted: 0,
    dirty: 0,
    description: "Salário",
    kind: "income",
    amountCents: 500000,
    accountId: "a",
    categoryId: null,
    frequency: "monthly",
    nextDate: "2026-01-05",
    active: 1,
    ...over,
  };
}

describe("nextOccurrence", () => {
  it("advances by frequency", () => {
    expect(nextOccurrence("2026-01-05", "daily")).toBe("2026-01-06");
    expect(nextOccurrence("2026-01-05", "weekly")).toBe("2026-01-12");
    expect(nextOccurrence("2026-01-05", "biweekly")).toBe("2026-01-19");
    expect(nextOccurrence("2026-01-05", "monthly")).toBe("2026-02-05");
    expect(nextOccurrence("2026-01-05", "yearly")).toBe("2027-01-05");
  });

  it("clamps month-end overflow (Jan 31 -> Feb 28)", () => {
    expect(nextOccurrence("2026-01-31", "monthly")).toBe("2026-02-28");
  });
});

describe("generateDueTransactions", () => {
  it("generates one tx per due occurrence and advances nextDate", () => {
    // mensal desde 05/01 até hoje 20/03 => jan, fev, mar = 3 lançamentos
    const { transactions, updates } = generateDueTransactions(
      [rec({ nextDate: "2026-01-05", frequency: "monthly" })],
      "2026-03-20",
    );
    expect(transactions).toHaveLength(3);
    expect(transactions.map((t) => t.date)).toEqual([
      "2026-01-05",
      "2026-02-05",
      "2026-03-05",
    ]);
    expect(transactions[0].recurrenceId).toBe("r1");
    expect(updates[0].nextDate).toBe("2026-04-05"); // próxima futura
    expect(updates[0].active).toBe(1);
  });

  it("does not generate anything when nextDate is in the future", () => {
    const { transactions, updates } = generateDueTransactions(
      [rec({ nextDate: "2026-12-01" })],
      "2026-03-20",
    );
    expect(transactions).toHaveLength(0);
    expect(updates).toHaveLength(0);
  });

  it("deactivates after endDate", () => {
    const { transactions, updates } = generateDueTransactions(
      [rec({ nextDate: "2026-01-05", frequency: "monthly", endDate: "2026-02-10" })],
      "2026-06-20",
    );
    // jan e fev geram; mar (05/03) passa de 10/02 -> para e desativa
    expect(transactions.map((t) => t.date)).toEqual(["2026-01-05", "2026-02-05"]);
    expect(updates[0].active).toBe(0);
  });

  it("ignores inactive recurrences", () => {
    const { transactions } = generateDueTransactions(
      [rec({ active: 0 })],
      "2026-06-20",
    );
    expect(transactions).toHaveLength(0);
  });
});
