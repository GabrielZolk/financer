import { describe, it, expect } from "vitest";
import { redactDescription, redactAll } from "./redact";

describe("redactDescription", () => {
  it("tira CPF e CNPJ", () => {
    expect(redactDescription("PIX 123.456.789-00")).toBe("PIX [cpf]");
    expect(redactDescription("PAG 12.345.678/0001-90 LTDA")).toBe(
      "PAG [cnpj] LTDA",
    );
  });

  it("tira e-mail", () => {
    expect(redactDescription("PIX fulano@gmail.com")).toBe("PIX [email]");
  });

  it("tira número de conta e cartão", () => {
    expect(redactDescription("COMPRA CARTAO **** 1234")).toBe(
      "COMPRA CARTAO [cartao]",
    );
    expect(redactDescription("TED AG 1234 CONTA 56789-0")).toContain("[conta]");
  });

  it("tira sequência longa de dígitos", () => {
    expect(redactDescription("TARIFA 00012345678901")).toBe("TARIFA [num]");
  });

  it("NÃO mexe no que a IA precisa pra categorizar", () => {
    expect(redactDescription("COMPRA CARTAO POSTO SHELL")).toBe(
      "COMPRA CARTAO POSTO SHELL",
    );
    expect(redactDescription("PG *IFD BR 08/26")).toBe("PG *IFD BR 08/26");
    expect(redactDescription("UBER* TRIP SP")).toBe("UBER* TRIP SP");
  });

  it("conta quantas linhas foram mascaradas", () => {
    const { redacted, changed } = redactAll([
      "MERCADO EXTRA",
      "PIX 123.456.789-00",
    ]);
    expect(changed).toBe(1);
    expect(redacted[0]).toBe("MERCADO EXTRA");
  });
});
