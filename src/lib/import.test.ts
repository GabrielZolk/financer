import { describe, it, expect } from "vitest";
import {
  parseDateFlexible,
  parseAmountSigned,
  parseCsvRows,
  guessCsvColumns,
  csvToTransactions,
  parseOfx,
  parseStatementText,
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

describe("PDF (texto do extrato)", () => {
  // formato típico de extrato de conta corrente: data, histórico, valor e saldo
  const extrato = `
Extrato de conta corrente
Agência 1234 Conta 56789-0
Período: 01/08/2026 a 15/08/2026

01/08 SALDO ANTERIOR 1.500,00
02/08 PIX ENVIADO JOAO DA SILVA -250,00 1.250,00
03/08 COMPRA CARTAO POSTO SHELL -91,00 1.159,00
05/08 SALARIO EMPRESA X 3.200,00 4.359,00
10/08 SALDO DO DIA 4.359,00
`;

  it("lê data, descrição e valor de cada linha", () => {
    const txs = parseStatementText(extrato);
    expect(txs).toHaveLength(3);
    expect(txs[0]).toEqual({
      date: "2026-08-02",
      description: "PIX ENVIADO JOAO DA SILVA",
      amountCents: -25000,
    });
    expect(txs[1].description).toBe("COMPRA CARTAO POSTO SHELL");
    expect(txs[2].amountCents).toBe(320000);
  });

  it("ignora linhas de saldo/total", () => {
    const txs = parseStatementText(extrato);
    expect(txs.some((t) => /saldo/i.test(t.description))).toBe(false);
  });

  it("usa o primeiro valor da linha (o segundo é o saldo corrente)", () => {
    const txs = parseStatementText("02/08/2026 UBER TRIP -25,90 1.474,10");
    expect(txs[0].amountCents).toBe(-2590);
  });

  it("entende o estilo D/C em vez de sinal", () => {
    const txs = parseStatementText(
      "Extrato 2026\n03/08 TARIFA MENSALIDADE 30,00 D\n04/08 RENDIMENTO 12,34 C",
    );
    expect(txs[0].amountCents).toBe(-3000);
    expect(txs[1].amountCents).toBe(1234);
  });

  it("pega o ano do cabeçalho quando a linha só tem dd/mm", () => {
    const txs = parseStatementText("Extrato de 2024\n07/03 MERCADO -80,00");
    expect(txs[0].date).toBe("2024-03-07");
  });

  it("devolve vazio quando o PDF não tem cara de extrato", () => {
    expect(parseStatementText("Contrato de prestação de serviços")).toEqual([]);
  });
});
