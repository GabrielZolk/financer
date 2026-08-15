import { describe, it, expect } from "vitest";
import { buildSnapshot } from "./aiSnapshot";
import type { Account, Category, Transaction } from "@/db/types";

const sync = {
  userId: "u1",
  createdAt: "2026-01-01",
  updatedAt: "2026-01-01",
  deleted: 0 as const,
  dirty: 0 as const,
};

const conta: Account = {
  ...sync,
  id: "a1",
  name: "Conta",
  type: "checking",
  currency: "BRL",
  initialBalanceCents: 100_000,
  color: "#000",
  icon: "wallet",
  archived: 0,
  order: 0,
};

const cats: Category[] = [
  {
    ...sync,
    id: "c-mercado",
    name: "Mercado",
    kind: "expense",
    parentId: null,
    color: "#000",
    icon: "cart",
    order: 0,
  },
  {
    ...sync,
    id: "c-segredo",
    name: "Terapia",
    kind: "expense",
    parentId: null,
    color: "#000",
    icon: "heart",
    order: 1,
  },
];

let n = 0;
const tx = (
  categoryId: string,
  amountCents: number,
  extra: Partial<Transaction> = {},
): Transaction => ({
  ...sync,
  id: `t${++n}`,
  accountId: "a1",
  toAccountId: null,
  categoryId,
  kind: "expense",
  amountCents,
  currency: "BRL",
  date: "2026-08-10",
  description: "x",
  tags: [],
  status: "cleared",
  ...extra,
});

const TODAY = "2026-08-15";

describe("buildSnapshot — privacidade", () => {
  it("não manda categoria de lançamento privado pra IA", () => {
    const snap = buildSnapshot(
      [conta],
      [tx("c-mercado", 20_000), tx("c-segredo", 30_000, { private: 1 })],
      cats,
      [],
      [],
      "BRL",
      TODAY,
    );
    const nomes = snap.gastoPorCategoriaMes.map((c) => c.categoria);
    expect(nomes).toContain("Mercado");
    expect(nomes).not.toContain("Terapia");
    expect(snap.privadosOmitidos).toBe(1);
  });

  it("não vaza o privado pelo orçamento da categoria", () => {
    const snap = buildSnapshot(
      [conta],
      [tx("c-segredo", 30_000, { private: 1 })],
      cats,
      [],
      [
        {
          ...sync,
          id: "b1",
          categoryId: "c-segredo",
          limitCents: 50_000,
          month: "2026-08",
          recurring: 1,
        },
      ],
      "BRL",
      TODAY,
    );
    expect(snap.orcamentosMes[0].gasto).toBe(0);
  });

  it("mantém saldo e total do mês completos (agregado não diz o quê)", () => {
    const snap = buildSnapshot(
      [conta],
      [tx("c-mercado", 20_000), tx("c-segredo", 30_000, { private: 1 })],
      cats,
      [],
      [],
      "BRL",
      TODAY,
    );
    expect(snap.saldoTotal).toBe(500); // 1000 - 200 - 300
    const ago = snap.ultimosMeses.find((m) => m.mes === "2026-08");
    expect(ago?.saidas).toBe(500);
  });

  it("sem privados, privadosOmitidos = 0", () => {
    const snap = buildSnapshot(
      [conta],
      [tx("c-mercado", 20_000)],
      cats,
      [],
      [],
      "BRL",
      TODAY,
    );
    expect(snap.privadosOmitidos).toBe(0);
  });
});
