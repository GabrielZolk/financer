import { describe, it, expect } from "vitest";
import { upcomingDue, addDaysStr } from "./upcoming";
import type { Account, Recurrence, Transaction } from "@/db/types";

function rec(p: Partial<Recurrence>): Recurrence {
  return {
    id: Math.random().toString(36).slice(2),
    userId: "local",
    createdAt: "",
    updatedAt: "",
    deleted: 0,
    dirty: 0,
    description: p.description ?? "Netflix",
    kind: p.kind ?? "expense",
    amountCents: p.amountCents ?? 5000,
    accountId: "acc",
    categoryId: null,
    frequency: "monthly",
    nextDate: p.nextDate ?? "2026-06-25",
    active: p.active ?? 1,
    ...p,
  } as Recurrence;
}

const card: Account = {
  id: "card",
  userId: "local",
  createdAt: "",
  updatedAt: "",
  deleted: 0,
  dirty: 0,
  name: "Nubank",
  type: "credit_card",
  currency: "BRL",
  initialBalanceCents: 0,
  color: "#000",
  icon: "credit-card",
  archived: 0,
  order: 0,
  statementDay: 28,
  dueDay: 5,
};

function tx(p: Partial<Transaction>): Transaction {
  return {
    id: Math.random().toString(36).slice(2),
    userId: "local",
    createdAt: "",
    updatedAt: "",
    deleted: 0,
    dirty: 0,
    accountId: "card",
    categoryId: null,
    kind: "expense",
    amountCents: 0,
    currency: "BRL",
    date: "2026-06-10",
    description: "",
    tags: [],
    status: "cleared",
    ...p,
  } as Transaction;
}

const TODAY = "2026-06-21";

describe("addDaysStr", () => {
  it("soma dias atravessando mês", () => {
    expect(addDaysStr("2026-06-25", 14)).toBe("2026-07-09");
  });
});

describe("upcomingDue", () => {
  it("inclui recorrência dentro do horizonte e ignora fora/inativa", () => {
    const items = upcomingDue(
      [
        rec({ description: "Netflix", nextDate: "2026-06-25" }), // dentro
        rec({ description: "Anual", nextDate: "2026-09-01" }), // fora
        rec({ description: "Inativa", nextDate: "2026-06-24", active: 0 }),
      ],
      [],
      [],
      TODAY,
      14,
    );
    expect(items.map((i) => i.label)).toEqual(["Netflix"]);
  });

  it("inclui fatura de cartão com vencimento no horizonte", () => {
    const items = upcomingDue(
      [],
      [card],
      [tx({ kind: "expense", amountCents: 10000, date: "2026-06-10" })],
      TODAY,
      20,
    );
    const inv = items.find((i) => i.kind === "invoice");
    expect(inv?.label).toBe("Fatura Nubank");
    expect(inv?.amountCents).toBe(10000);
  });

  it("ordena por data", () => {
    const items = upcomingDue(
      [
        rec({ description: "B", nextDate: "2026-06-30" }),
        rec({ description: "A", nextDate: "2026-06-23" }),
      ],
      [],
      [],
      TODAY,
      30,
    );
    expect(items.map((i) => i.label)).toEqual(["A", "B"]);
  });
});
