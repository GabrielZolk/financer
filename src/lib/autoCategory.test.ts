import { describe, it, expect } from "vitest";
import {
  descSignature,
  learnRules,
  applyLearnedRules,
} from "./autoCategory";
import type { Transaction } from "@/db/types";

let n = 0;
const tx = (
  description: string,
  categoryId: string | null,
  extra: Partial<Transaction> = {},
): Transaction =>
  ({
    id: `t${++n}`,
    userId: "local",
    createdAt: "2026-01-01",
    updatedAt: "2026-01-01",
    deleted: 0,
    dirty: 0,
    accountId: "a1",
    toAccountId: null,
    categoryId,
    kind: "expense",
    amountCents: 1000,
    currency: "BRL",
    date: "2026-07-01",
    description,
    tags: [],
    status: "cleared",
    ...extra,
  }) as Transaction;

describe("descSignature", () => {
  it("descarta ruído de extrato e fica com o estabelecimento", () => {
    expect(descSignature("PG *IFD BR 08/26")).toBe("ifd");
    expect(descSignature("COMPRA CARTAO UBER* TRIP")).toBe("uber trip");
  });

  it("é a mesma pra variações da mesma compra", () => {
    expect(descSignature("PG *IFD BR")).toBe(descSignature("pg *ifd br 12345"));
    expect(descSignature("Mercado Extra")).toBe(descSignature("MERCADO EXTRA"));
  });

  it("ignora acento e pontuação", () => {
    expect(descSignature("Farmácia São João")).toBe(
      descSignature("FARMACIA SAO JOAO"),
    );
  });

  it("devolve vazio quando só tem ruído/números", () => {
    expect(descSignature("PG 123 BR")).toBe("");
  });
});

describe("learnRules + applyLearnedRules", () => {
  const cats = [{ id: "food" }, { id: "transp" }];

  it("aprende do histórico e resolve a variação nova", () => {
    const rules = learnRules([
      tx("PG *IFD BR 07/26", "food"),
      tx("UBER* TRIP HELP", "transp"),
    ]);
    expect(
      applyLearnedRules(["PG *IFD BR 08/26", "UBER* TRIP SP"], rules, cats),
    ).toEqual(["food", "transp"]);
  });

  it("não chuta quando o histórico se divide", () => {
    const rules = learnRules([
      tx("MERCADO EXTRA", "food"),
      tx("MERCADO EXTRA", "transp"),
    ]);
    expect(applyLearnedRules(["MERCADO EXTRA"], rules, cats)).toEqual([null]);
  });

  it("vence a categoria dominante", () => {
    const rules = learnRules([
      tx("MERCADO EXTRA", "food"),
      tx("MERCADO EXTRA", "food"),
      tx("MERCADO EXTRA", "food"),
      tx("MERCADO EXTRA", "transp"),
    ]);
    expect(applyLearnedRules(["mercado extra"], rules, cats)).toEqual(["food"]);
  });

  it("ignora apagados, sem categoria e transferências", () => {
    const rules = learnRules([
      tx("SPOTIFY", "food", { deleted: 1 }),
      tx("NETFLIX", null),
      tx("PIX JOAO", "food", { kind: "transfer" }),
    ]);
    expect(
      applyLearnedRules(["SPOTIFY", "NETFLIX", "PIX JOAO"], rules, cats),
    ).toEqual([null, null, null]);
  });

  it("não sugere categoria que foi excluída", () => {
    const rules = learnRules([tx("PADARIA CENTRAL", "antiga")]);
    expect(applyLearnedRules(["PADARIA CENTRAL"], rules, cats)).toEqual([null]);
  });
});
