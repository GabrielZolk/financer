/**
 * Criptografia para os lançamentos privados (Nível 2).
 * Chave derivada do PIN via PBKDF2; conteúdo cifrado com AES-GCM.
 * Sem o PIN, os dados privados são ilegíveis (mesmo no IndexedDB / Supabase).
 */

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

function toB64(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}
function fromB64(s: string): Uint8Array {
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
}

/** Gera bytes aleatórios em base64 (salt, etc.). */
export function randomB64(bytes = 16): string {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return toB64(a);
}

/** Deriva uma chave AES-GCM a partir do PIN + salt. */
export async function deriveKey(pin: string, saltB64: string): Promise<CryptoKey> {
  const baseKey = await crypto.subtle.importKey(
    "raw",
    textEncoder.encode(pin),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: fromB64(saltB64) as BufferSource,
      iterations: 150_000,
      hash: "SHA-256",
    },
    baseKey,
    { name: "AES-GCM", length: 256 },
    true, // extraível: permite guardar a chave na sessão (sobrevive a F5)
    ["encrypt", "decrypt"],
  );
}

/** Exporta a chave AES como base64 (para persistir na sessão). */
export async function exportKeyRaw(key: CryptoKey): Promise<string> {
  return toB64(await crypto.subtle.exportKey("raw", key));
}

/** Reimporta uma chave AES a partir do base64. */
export async function importKeyRaw(b64: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    fromB64(b64) as BufferSource,
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"],
  );
}

export interface Cipher {
  iv: string;
  ct: string;
}

/** Cifra um objeto JSON. */
export async function encryptJSON(key: CryptoKey, obj: unknown): Promise<Cipher> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    textEncoder.encode(JSON.stringify(obj)),
  );
  return { iv: toB64(iv), ct: toB64(ct) };
}

/** Decifra; lança erro se a chave (PIN) estiver errada. */
export async function decryptJSON<T = unknown>(
  key: CryptoKey,
  iv: string,
  ct: string,
): Promise<T> {
  const pt = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromB64(iv) as BufferSource },
    key,
    fromB64(ct) as BufferSource,
  );
  return JSON.parse(textDecoder.decode(pt)) as T;
}
