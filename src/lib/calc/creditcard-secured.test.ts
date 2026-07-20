import { describe, it, expect } from "vitest";
import { effectiveLimit } from "./creditcard";
import type { Account } from "@/db/types";

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
