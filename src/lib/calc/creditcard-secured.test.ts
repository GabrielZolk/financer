import { describe, it, expect } from "vitest";
import { effectiveLimit, invoicePaid } from "./creditcard";
import type { Account, Transaction } from "@/db/types";

const card = (creditLimitCents?: number): Account =>
  ({
    id: "c",
    name: "Itaú",
    type: "credit_card",
    currency: "BRL",
    initialBalanceCents: 0,
    color: "#000",
    icon: "credit-card",
    archived: 0,
    order: 0,
    creditLimitCents,
    updatedAt: "",
    deleted: 0,
    dirty: 0,
    userId: "local",
  }) as unknown as Account;

describe("effectiveLimit (limite garantido)", () => {
  it("soma o saldo da garantia ao limite base", () => {
    expect(effectiveLimit(card(50000), 100000)).toBe(150000);
  });

  it("sem garantia, retorna só o limite base", () => {
    expect(effectiveLimit(card(50000), 0)).toBe(50000);
  });

  it("sem limite base, o limite é só a garantia", () => {
    expect(effectiveLimit(card(undefined), 100000)).toBe(100000);
  });

  it("garantia negativa não reduz o limite", () => {
    expect(effectiveLimit(card(50000), -3000)).toBe(50000);
  });
});

const pay = (over: Partial<Transaction>): Transaction =>
  ({
    id: Math.random().toString(),
    accountId: "src",
    toAccountId: "c",
    categoryId: null,
    kind: "transfer",
    amountCents: 10000,
    currency: "BRL",
    date: "2026-06-15",
    description: "",
    tags: [],
    status: "cleared",
    deleted: 0,
    dirty: 0,
    userId: "local",
    updatedAt: "",
    ...over,
  }) as unknown as Transaction;

const junho = { ym: "2026-06", cycleStart: "2026-06-01", closeDate: "2026-06-30" };

describe("invoicePaid (pagar fatura por mês)", () => {
  it("conta pagamento marcado com paysInvoiceMonth do mês", () => {
    const txs = [pay({ paysInvoiceMonth: "2026-06", date: "2026-07-05" })];
    expect(invoicePaid(card(), txs, junho)).toBe(10000);
  });

  it("ignora pagamento marcado de OUTRO mês", () => {
    const txs = [pay({ paysInvoiceMonth: "2026-07", date: "2026-06-10" })];
    expect(invoicePaid(card(), txs, junho)).toBe(0);
  });

  it("legado: sem marca, conta pela data cair no ciclo", () => {
    const txs = [pay({ date: "2026-06-20" })];
    expect(invoicePaid(card(), txs, junho)).toBe(10000);
  });

  it("legado fora do ciclo não conta", () => {
    const txs = [pay({ date: "2026-05-20" })];
    expect(invoicePaid(card(), txs, junho)).toBe(0);
  });

  it("despesa no cartão não é pagamento", () => {
    const txs = [pay({ kind: "expense", toAccountId: null, date: "2026-06-10" })];
    expect(invoicePaid(card(), txs, junho)).toBe(0);
  });
});
