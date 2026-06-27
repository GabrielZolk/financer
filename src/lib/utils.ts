import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Combina classes Tailwind resolvendo conflitos. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/** Gera um id único (uuid v4 quando disponível). */
export function uid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  // fallback
  return "id-" + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

/** Timestamp ISO atual. */
export function nowIso(): string {
  return new Date().toISOString();
}

/** Mês atual no formato YYYY-MM. */
export function currentMonth(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

/** Confirmação padrão antes de excluir algo (evita exclusão acidental). */
export function confirmDelete(what: string): boolean {
  return window.confirm(`Excluir ${what}? Essa ação não pode ser desfeita.`);
}
