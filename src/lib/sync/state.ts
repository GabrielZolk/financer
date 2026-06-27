import { useSyncExternalStore } from "react";

export type SyncStatus =
  | "disabled" // Supabase não configurado
  | "signed_out" // configurado, mas sem login
  | "idle" // logado, em dia
  | "syncing"
  | "offline"
  | "error";

export interface SyncState {
  status: SyncStatus;
  lastSyncAt: string | null;
  pending: number;
  error: string | null;
  email: string | null;
}

let state: SyncState = {
  status: "disabled",
  lastSyncAt: null,
  pending: 0,
  error: null,
  email: null,
};

const listeners = new Set<() => void>();

export function getSyncState(): SyncState {
  return state;
}

export function setSyncState(patch: Partial<SyncState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** Hook reativo com o estado do sync. */
export function useSyncState(): SyncState {
  return useSyncExternalStore(subscribe, getSyncState, getSyncState);
}
