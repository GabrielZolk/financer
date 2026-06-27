import { useSyncExternalStore } from "react";
import { deriveKey, encryptJSON, decryptJSON, randomB64, type Cipher } from "./crypto";

/**
 * Bloqueio do app inteiro por PIN. Independente da privacidade (que tem PIN
 * momentâneo próprio). Aqui o PIN é estável: valida na abertura do app.
 * Guardado só no dispositivo (não sincroniza).
 */
const KEY = "fin.applock";

interface Meta {
  salt: string;
  verifier: Cipher;
}
interface State {
  enabled: boolean;
  unlocked: boolean;
}

let state: State = { enabled: false, unlocked: true };
const listeners = new Set<() => void>();
function emit() {
  listeners.forEach((l) => l());
}
function set(patch: Partial<State>) {
  state = { ...state, ...patch };
  emit();
}
function readMeta(): Meta | null {
  try {
    const r = localStorage.getItem(KEY);
    return r ? (JSON.parse(r) as Meta) : null;
  } catch {
    return null;
  }
}

/** No boot: se houver PIN, o app começa BLOQUEADO. */
export function initAppLock() {
  const meta = readMeta();
  set({ enabled: !!meta, unlocked: !meta });
}

export function isAppLockEnabled(): boolean {
  return !!readMeta();
}

export async function enableAppLock(pin: string): Promise<void> {
  const salt = randomB64();
  const key = await deriveKey(pin, salt);
  const verifier = await encryptJSON(key, { v: 1 });
  localStorage.setItem(KEY, JSON.stringify({ salt, verifier }));
  set({ enabled: true, unlocked: true });
}

/** Destrava o app; lança erro se o PIN estiver errado. */
export async function unlockApp(pin: string): Promise<void> {
  const meta = readMeta();
  if (!meta) {
    set({ unlocked: true });
    return;
  }
  const key = await deriveKey(pin, meta.salt);
  await decryptJSON(key, meta.verifier.iv, meta.verifier.ct); // lança se errado
  set({ unlocked: true });
}

/** Desliga o bloqueio (precisa do PIN atual). */
export async function disableAppLock(pin: string): Promise<void> {
  const meta = readMeta();
  if (meta) {
    const key = await deriveKey(pin, meta.salt);
    await decryptJSON(key, meta.verifier.iv, meta.verifier.ct); // valida
  }
  localStorage.removeItem(KEY);
  set({ enabled: false, unlocked: true });
}

/** Bloqueia o app manualmente (se habilitado). */
export function lockAppNow() {
  if (isAppLockEnabled()) set({ unlocked: false });
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
export function useAppLock(): State {
  return useSyncExternalStore(
    subscribe,
    () => state,
    () => state,
  );
}
