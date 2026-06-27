import { describe, it, expect } from "vitest";
import {
  parseDateFlexible,
  parseAmountSigned,
  parseCsvRows,
  guessCsvColumns,
  csvToTransactions,
  parseOfx,
} from "./import";

describe("parseDateFlexible", () => {
  it("handles common formats", () => {
    expect(parseDateFlexible("05/06/2026")).toBe("2026-06-05");
    expect(parseDateFlexible("2026-06-05")).toBe("2026-06-05");
    expect(parseDateFlexible("05-06-26")).toBe("2026-06-05");
    expect(parseDateFlexible("20260605")).toBe("2026-06-05");
    expect(parseDateFlexible("xx")).toBeNull();
  });
});

describe("parseAmountSigned", () => {
  it("keeps sign, BR and US formats", () => {
    expect(parseAmountSigned("-1.234,56")).toBe(-123456);
    expect(parseAmountSigned("1234.56")).toBe(123456);
    expect(parseAmountSigned("R$ 50,00")).toBe(5000);
    expect(parseAmountSigned("(20,00)")).toBe(-2000); // parênteses = negativo
    expect(parseAmountSigned("")).toBeNull();
  });
});

describe("CSV import", () => {
  const csv = `Data;Histórico;Valor
05/06/2026;Mercado;-150,00
06/06/2026;Salário;5000,00
07/06/2026;Uber;-25,90`;

  it("parses rows with ; delimiter", () => {
    const rows = parseCsvRows(csv);
    expect(rows).toHaveLength(4); // header + 3
    expect(rows[1]).toEqual(["05/06/2026", "Mercado", "-150,00"]);
  });

  it("guesses columns from header", () => {
    const rows = parseCsvRows(csv);
    const cols = guessCsvColumns(rows);
    expect(cols.headerRow).toBe(0);
    expect(cols.date).toBe(0);
    expect(cols.description).toBe(1);
    expect(cols.amount).toBe(2);
  });

  it("converts to signed transactions", () => {
    const rows = parseCsvRows(csv);
    const cols = guessCsvColumns(rows);
    const txs = csvToTransactions(rows, cols);
    expect(txs).toHaveLength(3);
    expect(txs[0]).toEqual({ date: "2026-06-05", description: "Mercado", amountCents: -15000 });
    expect(txs[1].amountCents).toBe(500000);
    expect(txs[2].amountCents).toBe(-2590);
  });

  it("handles comma delimiter without header", () => {
    const rows = parseCsvRows("2026-06-05,Compra,-10.50\n2026-06-06,Pix,200.00");
    const cols = guessCsvColumns(rows);
    const txs = csvToTransactions(rows, cols);
    expect(txs).toHaveLength(2);
    expect(txs[0].amountCents).toBe(-1050);
  });
});

describe("OFX import", () => {
  const ofx = `<OFX><BANKMSGSRSV1><STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260605120000<TRNAMT>-150.00<MEMO>Mercado</STMTTRN><STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20260606<TRNAMT>5000.00<NAME>Salario</STMTTRN></BANKMSGSRSV1></OFX>`;

  it("extracts transactions", () => {
    const txs = parseOfx(ofx);
    expect(txs).toHaveLength(2);
    expect(txs[0]).toEqual({ date: "2026-06-05", description: "Mercado", amountCents: -15000 });
    expect(txs[1]).toEqual({ date: "2026-06-06", description: "Salario", amountCents: 500000 });
  });
});
