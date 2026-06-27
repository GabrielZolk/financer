import { describe, it, expect } from "vitest";
import {
  parseMoney,
  formatMoney,
  sumCents,
  toCents,
  fromCents,
  formatSigned,
} from "./money";

describe("parseMoney", () => {
  it("parses pt-BR format", () => {
    expect(parseMoney("1.234,56")).toBe(123456);
    expect(parseMoney("10,50")).toBe(1050);
    expect(parseMoney("R$ 99,90")).toBe(9990);
  });

  it("parses en-US format", () => {
    expect(parseMoney("1,234.56")).toBe(123456);
    expect(parseMoney("1234.56")).toBe(123456);
  });

  it("parses plain integers", () => {
    expect(parseMoney("100")).toBe(10000);
    expect(parseMoney("0")).toBe(0);
  });

  it("handles negatives", () => {
    expect(parseMoney("-12,34")).toBe(-1234);
  });

  it("returns null for garbage", () => {
    expect(parseMoney("")).toBeNull();
    expect(parseMoney("abc")).toBeNull();
    expect(parseMoney(",")).toBeNull();
  });
});

describe("integer cent math is exact (no float drift)", () => {
  it("sums 0.1 + 0.2 exactly", () => {
    // O clássico bug do float: 0.1 + 0.2 !== 0.3
    const cents = sumCents([toCents(0.1), toCents(0.2)]);
    expect(cents).toBe(30);
    expect(fromCents(cents)).toBe(0.3);
  });

  it("sums a long list without drift", () => {
    const items = Array.from({ length: 1000 }, () => toCents(0.01));
    expect(sumCents(items)).toBe(1000); // R$ 10,00
  });
});

describe("formatMoney", () => {
  it("formats BRL in pt-BR", () => {
    // usa NBSP entre símbolo e número
    expect(formatMoney(123456)).toMatch(/R\$\s?1\.234,56/);
  });

  it("formats signed values", () => {
    expect(formatSigned(1000)).toMatch(/^\+/);
    expect(formatSigned(-1000)).toMatch(/^-/);
  });
});
