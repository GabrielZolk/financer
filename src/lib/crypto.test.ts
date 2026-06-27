import { describe, it, expect } from "vitest";
import { deriveKey, encryptJSON, decryptJSON, randomB64 } from "./crypto";

describe("crypto (AES-GCM + PBKDF2)", () => {
  it("ida-e-volta com o PIN certo", async () => {
    const salt = randomB64();
    const key = await deriveKey("1234", salt);
    const payload = { description: "Terapia", amountCents: 30000, tags: ["x"] };
    const { iv, ct } = await encryptJSON(key, payload);
    const back = await decryptJSON(key, iv, ct);
    expect(back).toEqual(payload);
  });

  it("PIN errado falha ao decifrar", async () => {
    const salt = randomB64();
    const key = await deriveKey("1234", salt);
    const wrong = await deriveKey("0000", salt);
    const { iv, ct } = await encryptJSON(key, { a: 1 });
    await expect(decryptJSON(wrong, iv, ct)).rejects.toBeTruthy();
  });

  it("ciphertext não vaza o conteúdo", async () => {
    const key = await deriveKey("1234", randomB64());
    const { ct } = await encryptJSON(key, { description: "SEGREDO" });
    expect(ct).not.toContain("SEGREDO");
  });
});
