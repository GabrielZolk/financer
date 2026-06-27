import { describe, it, expect } from "vitest";
import { goalPotes, goalSaved } from "./goals";
import type { Goal } from "@/db/types";

function goal(p: Partial<Goal>): Goal {
  return {
    id: "g",
    userId: "local",
    createdAt: "",
    updatedAt: "",
    deleted: 0,
    dirty: 0,
    name: "M",
    targetCents: 100000,
    savedCents: 0,
    color: "#000",
    archived: 0,
    ...p,
  } as Goal;
}

describe("goalPotes", () => {
  it("usa accountIds quando presente", () => {
    expect(goalPotes(goal({ accountIds: ["a", "b"] }))).toEqual(["a", "b"]);
  });
  it("cai no accountId antigo", () => {
    expect(goalPotes(goal({ accountId: "x" }))).toEqual(["x"]);
  });
  it("vazio quando não há nenhum", () => {
    expect(goalPotes(goal({}))).toEqual([]);
  });
});

describe("goalSaved", () => {
  const balances = new Map([
    ["cofrinho", 5400],
    ["limite", 10000],
    ["cc", 355000],
  ]);
  it("soma os saldos dos potes", () => {
    expect(goalSaved(goal({ accountIds: ["cofrinho", "limite"] }), balances)).toBe(
      15400,
    );
  });
  it("um pote só = saldo dele", () => {
    expect(goalSaved(goal({ accountId: "cofrinho" }), balances)).toBe(5400);
  });
  it("sem potes = savedCents manual", () => {
    expect(goalSaved(goal({ savedCents: 7777 }), balances)).toBe(7777);
  });
  it("pote inexistente conta como 0", () => {
    expect(goalSaved(goal({ accountIds: ["sumiu"] }), balances)).toBe(0);
  });
});
