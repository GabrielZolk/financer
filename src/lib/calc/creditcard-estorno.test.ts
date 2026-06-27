import { describe, it, expect } from "vitest";
import { currentInvoice } from "./creditcard";
import type { Account, Transaction } from "@/db/types";

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
  creditLimitCents: 300000,
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

const TODAY = "2026-06-21"; // ciclo aberto ~29/05–28/06

describe("currentInvoice — estorno/crédito", () => {
  it("estorno (receita no cartão) abate a fatura", () => {
    const inv = currentInvoice(
      card,
      [
        tx({ kind: "expense", amountCents: 25000, date: "2026-06-10" }),
        tx({ kind: "income", amountCents: 11200, date: "2026-06-12" }), // estorno
      ],
      TODAY,
    );
    expect(inv?.totalCents).toBe(13800); // 250 - 112
  });

  it("nunca fica negativa (crédito maior que a compra)", () => {
    const inv = currentInvoice(
      card,
      [
        tx({ kind: "expense", amountCents: 5000, date: "2026-06-10" }),
        tx({ kind: "income", amountCents: 9000, date: "2026-06-12" }),
      ],
      TODAY,
    );
    expect(inv?.totalCents).toBe(0);
  });

  it("ignora pendentes e lançamentos fora do ciclo", () => {
    const inv = currentInvoice(
      card,
      [
        tx({ kind: "expense", amountCents: 10000, date: "2026-06-10" }),
        tx({ kind: "income", amountCents: 5000, date: "2026-06-12", status: "pending" }),
        tx({ kind: "income", amountCents: 5000, date: "2026-04-01" }),
      ],
      TODAY,
    );
    expect(inv?.totalCents).toBe(10000);
  });
});
