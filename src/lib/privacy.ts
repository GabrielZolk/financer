import { useSyncExternalStore } from "react";
import { db } from "@/db/schema";
import type { Transaction } from "@/db/types";
import {
  deriveKey,
  encryptJSON,
  decryptJSON,
  randomB64,
  exportKeyRaw,
  importKeyRaw,
  type Cipher,
} from "./crypto";
import { supabase } from "./supabase";
import { nowIso } from "./utils";
import { getCurrentUserId } from "@/db/repo";

export type PrivacyMode = "locked" | "partial" | "full";

interface PrivacyState {
  configured: boolean; // já tem PIN definido
  unlocked: boolean; // chave em memória nesta sessão
  mode: PrivacyMode;
  version: number; // bump quando o cache de decifrados muda
}

const STORE_KEY = "fin.privacy"; // device-local (NÃO sincroniza)
const SESSION_KEY = "fin.privacy.session"; // sessionStorage: mantém destravado entre F5

interface StoredMeta {
  salt: string;
  verifier: Cipher; // sentinela cifrada p/ validar o PIN
}

let state: PrivacyState = {
  configured: false,
  unlocked: false,
  mode: "full",
  version: 0,
};

// em memória apenas — nunca persistido
let cryptoKey: CryptoKey | null = null;
const decrypted = new Map<string, Record<string, unknown>>();

const listeners = new Set<() => void>();
function emit() {
  listeners.forEach((l) => l());
}
function setState(patch: Partial<PrivacyState>) {
  state = { ...state, ...patch };
  emit();
}

function readMeta(): StoredMeta | null {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    return raw ? (JSON.parse(raw) as StoredMeta) : null;
  } catch {
    return null;
  }
}

/* --------- sessão destravada (sessionStorage: sobrevive a F5, some ao fechar) ----- */
interface Session {
  key: string; // chave AES exportada (base64)
  mode: "partial" | "full";
}
function readSession(): Session | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}
async function saveSession(mode: "partial" | "full"): Promise<void> {
  if (!cryptoKey) return;
  try {
    const key = await exportKeyRaw(cryptoKey);
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ key, mode }));
  } catch {
    /* sessionStorage indisponível — ignora */
  }
}
function clearSession(): void {
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch {
    /* ignora */
  }
}

const REMOTE_ID = (userId: string) => `pmeta:${userId}`;

/**
 * Sincroniza o "sal"+verificador (NÃO secretos) com o Supabase, para o mesmo
 * PIN destravar em qualquer dispositivo. Regra: o remoto é canônico quando existe.
 */
export async function syncPrivacyMeta(userId: string): Promise<void> {
  if (!supabase || userId === "local") return;
  const local = readMeta();
  const { data } = await supabase
    .from("records")
    .select("data")
    .eq("id", REMOTE_ID(userId))
    .maybeSingle();
  const remote = (data?.data as StoredMeta | undefined) ?? null;

  if (remote && JSON.stringify(remote) !== JSON.stringify(local)) {
    // remoto vence (mantém um sal canônico entre dispositivos)
    localStorage.setItem(STORE_KEY, JSON.stringify(remote));
    if (!state.configured) setState({ configured: true });
  } else if (local && !remote) {
    await supabase.from("records").upsert(
      {
        id: REMOTE_ID(userId),
        user_id: userId,
        table_name: "privacy_meta",
        data: local,
        updated_at: nowIso(),
        deleted: false,
      },
      { onConflict: "id" },
    );
  }
}

/**
 * Lê o estado inicial (no boot). Se houver uma sessão destravada salva
 * (sessionStorage), reimporta a chave e volta destravado no mesmo modo —
 * assim um F5 NÃO re-trava (só travar de propósito ou fechar o app).
 */
export async function initPrivacy() {
  const meta = readMeta();
  if (!meta) {
    setState({ configured: false, unlocked: false, mode: "full" });
    return;
  }
  setState({ configured: true });

  const sess = readSession();
  if (sess) {
    try {
      cryptoKey = await importKeyRaw(sess.key);
      await decryptAllPrivate();
      setState({ unlocked: true, mode: sess.mode, version: state.version + 1 });
      return;
    } catch {
      clearSession();
      cryptoKey = null;
      decrypted.clear();
    }
  }
  setState({ unlocked: false, mode: "locked" });
}

export function isPrivacyConfigured(): boolean {
  return !!readMeta();
}

/** Define o PIN pela primeira vez. Deixa destravado (modo full) para começar. */
export async function setupPin(pin: string): Promise<void> {
  const salt = randomB64();
  const key = await deriveKey(pin, salt);
  const verifier = await encryptJSON(key, { v: 1 });
  localStorage.setItem(STORE_KEY, JSON.stringify({ salt, verifier }));
  cryptoKey = key;
  decrypted.clear();
  setState({ configured: true, unlocked: true, mode: "full", version: state.version + 1 });
  void saveSession("full");
  // sobe o sal (não-secreto) pra valer cross-device
  void syncPrivacyMeta(getCurrentUserId()).catch(() => {});
}

/** Destrava com o PIN e entra no modo escolhido. Lança erro se PIN errado. */
export async function unlock(pin: string, mode: "partial" | "full"): Promise<void> {
  const meta = readMeta();
  if (!meta) throw new Error("Privacidade não configurada.");
  const key = await deriveKey(pin, meta.salt);
  // valida o PIN tentando decifrar a sentinela
  await decryptJSON(key, meta.verifier.iv, meta.verifier.ct); // lança se errado
  cryptoKey = key;
  await decryptAllPrivate();
  setState({ unlocked: true, mode, version: state.version + 1 });
  void saveSession(mode);
}

/** Trava de novo (sem trocar PIN). */
export function lock() {
  cryptoKey = null;
  decrypted.clear();
  clearSession();
  setState({ unlocked: false, mode: "locked", version: state.version + 1 });
}

/**
 * Trava DEFININDO um PIN (pode ser novo a cada vez). Re-criptografa os
 * lançamentos privados com a nova chave e guarda o novo sal. Precisa estar
 * destravado (os privados precisam estar decifrados em memória).
 */
export async function relockWithPin(pin: string): Promise<void> {
  const salt = randomB64();
  const newKey = await deriveKey(pin, salt);
  const verifier = await encryptJSON(newKey, { v: 1 });
  // re-cifra cada privado com a nova chave
  for (const [id, payload] of decrypted) {
    const cipher = await encryptJSON(newKey, payload);
    await db.transactions.update(id, {
      enc: cipher.ct,
      iv: cipher.iv,
      updatedAt: nowIso(),
      dirty: 1,
    });
  }
  localStorage.setItem(STORE_KEY, JSON.stringify({ salt, verifier }));
  cryptoKey = null;
  decrypted.clear();
  clearSession();
  setState({
    configured: true,
    unlocked: false,
    mode: "locked",
    version: state.version + 1,
  });
  void syncPrivacyMeta(getCurrentUserId()).catch(() => {});
}

/** Troca o modo entre partial/full quando já destravado. */
export function setMode(mode: PrivacyMode) {
  if (mode !== "locked" && !state.unlocked) return;
  setState({ mode, version: state.version + 1 });
  if (state.unlocked && mode !== "locked") void saveSession(mode);
}

async function decryptAllPrivate() {
  if (!cryptoKey) return;
  const all = await db.transactions.toArray();
  for (const t of all) {
    if (t.private === 1 && t.deleted === 0 && t.enc && t.iv) {
      try {
        const payload = await decryptJSON<Record<string, unknown>>(
          cryptoKey,
          t.iv,
          t.enc,
        );
        decrypted.set(t.id, payload);
      } catch {
        /* ignora itens que não decifram */
      }
    }
  }
}

/** Cifra o payload sensível de um lançamento privado (precisa estar destravado). */
export async function encryptPayload(payload: unknown): Promise<Cipher> {
  if (!cryptoKey) throw new Error("Destrave a privacidade primeiro.");
  return encryptJSON(cryptoKey, payload);
}

/** Registra um item recém-criado/editado no cache (já destravado). */
export function cacheDecrypted(id: string, payload: Record<string, unknown>) {
  decrypted.set(id, payload);
  setState({ version: state.version + 1 });
}

/**
 * Mescla os campos decifrados nos lançamentos privados (para TOTAIS).
 * - destravado: privado vira objeto real (valor entra nos cálculos)
 * - travado: continua "casca" com valor 0 (fica fora dos totais)
 */
export function mergeForTotals(txs: Transaction[]): Transaction[] {
  if (!state.unlocked) return txs;
  return txs.map((t) => {
    if (t.private !== 1) return t;
    const d = decrypted.get(t.id);
    return d ? ({ ...t, ...d, private: 1 } as Transaction) : t;
  });
}

/** Um lançamento aparece nas LISTAS? (privado só no modo full) */
export function isListed(tx: Transaction, mode: PrivacyMode): boolean {
  return tx.private !== 1 || mode === "full";
}

/* ------------------------------- React hook ------------------------------- */
function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
export function usePrivacy(): PrivacyState {
  return useSyncExternalStore(
    subscribe,
    () => state,
    () => state,
  );
}
