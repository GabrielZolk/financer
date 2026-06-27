import { describe, it, expect } from "vitest";
import type { Account, Budget, Transaction } from "@/db/types";
import { accountBalance, balancesByAccount, netWorth } from "./balance";
import { cashflow, totalsByCategory } from "./cashflow";
import { budgetStatus } from "./budget";

function acc(id: string, over: Partial<Account> = {}): Account {
  return {
    id,
    userId: "local",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    deleted: 0,
    dirty: 0,
    name: id,
    type: "checking",
    currency: "BRL",
    initialBalanceCents: 0,
    color: "#000",
    icon: "wallet",
    archived: 0,
    order: 0,
    ...over,
  };
}

function tx(over: Partial<Transaction>): Transaction {
  return {
    id: Math.random().toString(36),
    userId: "local",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    deleted: 0,
    dirty: 0,
    accountId: "a",
    categoryId: null,
    kind: "expense",
    amountCents: 0,
    currency: "BRL",
    date: "2026-06-01",
    description: "",
    tags: [],
    status: "cleared",
    ...over,
  };
}

describe("accountBalance", () => {
  it("initial + income - expense", () => {
    const a = acc("a", { initialBalanceCents: 10000 });
    const txs = [
      tx({ accountId: "a", kind: "income", amountCents: 5000 }),
      tx({ accountId: "a", kind: "expense", amountCents: 2000 }),
    ];
    expect(accountBalance(a, txs)).toBe(13000);
  });

  it("ignores pending unless requested", () => {
    const a = acc("a", { initialBalanceCents: 0 });
    const txs = [
      tx({ accountId: "a", kind: "income", amountCents: 5000, status: "pending" }),
    ];
    expect(accountBalance(a, txs)).toBe(0);
    expect(accountBalance(a, txs, { includePending: true })).toBe(5000);
  });

  it("ignores soft-deleted", () => {
    const a = acc("a", { initialBalanceCents: 0 });
    const txs = [tx({ accountId: "a", kind: "income", amountCents: 5000, deleted: 1 })];
    expect(accountBalance(a, txs)).toBe(0);
  });
});

describe("transfers move money between accounts", () => {
  it("debits source, credits destination", () => {
    const accounts = [acc("a", { initialBalanceCents: 10000 }), acc("b")];
    const txs = [
      tx({ kind: "transfer", accountId: "a", toAccountId: "b", amountCents: 3000 }),
    ];
    const balances = balancesByAccount(accounts, txs);
    expect(balances.get("a")).toBe(7000);
    expect(balances.get("b")).toBe(3000);
  });
});

describe("cashflow excludes transfers", () => {
  it("counts only income/expense", () => {
    const txs = [
      tx({ kind: "income", amountCents: 8000 }),
      tx({ kind: "expense", amountCents: 3000 }),
      tx({ kind: "transfer", accountId: "a", toAccountId: "b", amountCents: 5000 }),
    ];
    const cf = cashflow(txs, "2026-06-01", "2026-06-30");
    expect(cf.income).toBe(8000);
    expect(cf.expense).toBe(3000);
    expect(cf.net).toBe(5000);
  });
});

describe("totalsByCategory", () => {
  it("groups and sorts desc", () => {
    const txs = [
      tx({ kind: "expense", amountCents: 1000, categoryId: "food" }),
      tx({ kind: "expense", amountCents: 4000, categoryId: "rent" }),
      tx({ kind: "expense", amountCents: 500, categoryId: "food" }),
    ];
    const totals = totalsByCategory(txs, "expense");
    expect(totals[0]).toEqual({ categoryId: "rent", total: 4000 });
    expect(totals[1]).toEqual({ categoryId: "food", total: 1500 });
  });
});

describe("budgetStatus", () => {
  const budget: Budget = {
    id: "bud",
    userId: "local",
    createdAt: "x",
    updatedAt: "x",
    deleted: 0,
    dirty: 0,
    categoryId: "food",
    month: "2026-06",
    limitCents: 50000,
  };

  it("computes spent / remaining / overBudget", () => {
    const txs = [
      tx({ kind: "expense", amountCents: 30000, categoryId: "food", date: "2026-06-10" }),
      tx({ kind: "expense", amountCents: 25000, categoryId: "food", date: "2026-06-20" }),
      // outro mês não conta:
      tx({ kind: "expense", amountCents: 99999, categoryId: "food", date: "2026-05-01" }),
    ];
    const s = budgetStatus(budget, txs);
    expect(s.spentCents).toBe(55000);
    expect(s.remainingCents).toBe(-5000);
    expect(s.overBudget).toBe(true);
    expect(s.ratio).toBeCloseTo(1.1);
  });
});

describe("netWorth converts currencies to base", () => {
  it("applies rate for non-base accounts", () => {
    const accounts = [
      acc("brl", { currency: "BRL", initialBalanceCents: 10000 }),
      acc("usd", { currency: "USD", initialBalanceCents: 10000 }),
    ];
    const rate = (c: string) => (c === "USD" ? 5 : 1); // 1 USD = 5 BRL
    const nw = netWorth(accounts, [], "BRL", rate);
    expect(nw).toBe(10000 + 50000);
  });
});
