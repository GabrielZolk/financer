import type { Account, Budget, Category, Goal } from "@/db/types";
import { create, update } from "@/db/repo";
import { db } from "@/db/schema";

/**
 * Ações que o assistente pode PROPOR no chat (function-calling).
 * Nada é executado sozinho: a ChatPage mostra um cartão e só aplica se o
 * usuário confirmar. O lançamento nem é gravado aqui — abre o formulário.
 */
export type ChatAction =
  | {
      type: "goal";
      name: string;
      targetCents: number;
      deadline: string | null;
    }
  | {
      type: "budget";
      categoryId: string;
      categoryName: string;
      limitCents: number;
      month: string; // YYYY-MM
    }
  | {
      type: "transaction";
      kind: "expense" | "income";
      amountCents: number;
      description: string;
      categoryId: string | null;
      accountId: string | null;
      date: string; // YYYY-MM-DD
    };

export interface ActionCtx {
  accounts: Pick<Account, "id" | "name" | "archived">[];
  categories: Pick<Category, "id" | "name" | "kind">[];
  today: string;
}

const GOAL_COLORS = ["#6366f1", "#16a34a", "#f59e0b", "#ec4899", "#0ea5e9"];

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .toLowerCase();

function toCents(v: unknown): number | null {
  const n = typeof v === "number" ? v : Number(String(v ?? "").replace(",", "."));
  if (!Number.isFinite(n) || n <= 0 || n > 1e9) return null;
  return Math.round(n * 100);
}

function isDate(v: unknown): v is string {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
}

function findByName<T extends { id: string; name: string }>(
  list: T[],
  name: unknown,
): T | null {
  if (typeof name !== "string" || !name.trim()) return null;
  const n = norm(name);
  return (
    list.find((x) => norm(x.name) === n) ??
    list.find((x) => norm(x.name).includes(n) || n.includes(norm(x.name))) ??
    null
  );
}

/**
 * Converte a chamada de ferramenta do modelo numa ação válida.
 * Devolve `null` se os argumentos não fecharem (id inexistente, valor inválido)
 * — melhor não propor nada do que propor lixo.
 */
export function parseToolCall(
  name: string,
  argsJson: string,
  ctx: ActionCtx,
): ChatAction | null {
  let a: Record<string, unknown>;
  try {
    a = JSON.parse(argsJson || "{}") as Record<string, unknown>;
  } catch {
    return null;
  }

  if (name === "criar_meta") {
    const nome = typeof a.nome === "string" ? a.nome.trim().slice(0, 60) : "";
    const cents = toCents(a.valorAlvo);
    if (!nome || !cents) return null;
    return {
      type: "goal",
      name: nome,
      targetCents: cents,
      deadline: isDate(a.dataAlvo) ? a.dataAlvo : null,
    };
  }

  if (name === "criar_orcamento") {
    const cat = findByName(
      ctx.categories.filter((c) => c.kind !== "income"),
      a.categoria,
    );
    const cents = toCents(a.valorLimite);
    if (!cat || !cents) return null;
    return {
      type: "budget",
      categoryId: cat.id,
      categoryName: cat.name,
      limitCents: cents,
      month: ctx.today.slice(0, 7),
    };
  }

  if (name === "criar_lancamento") {
    const cents = toCents(a.valor);
    if (!cents) return null;
    const kind = a.tipo === "receita" ? "income" : "expense";
    const cat = findByName(
      ctx.categories.filter((c) =>
        kind === "income" ? c.kind !== "expense" : c.kind !== "income",
      ),
      a.categoria,
    );
    const acc = findByName(
      ctx.accounts.filter((x) => !x.archived),
      a.conta,
    );
    return {
      type: "transaction",
      kind,
      amountCents: cents,
      description:
        typeof a.descricao === "string" ? a.descricao.trim().slice(0, 120) : "",
      categoryId: cat?.id ?? null,
      accountId: acc?.id ?? null,
      date: isDate(a.data) ? a.data : ctx.today,
    };
  }

  return null;
}

/** Aplica a ação já confirmada pelo usuário (meta/orçamento). */
export async function applyAction(action: ChatAction): Promise<void> {
  if (action.type === "goal") {
    await create<Goal>("goals", {
      name: action.name,
      targetCents: action.targetCents,
      savedCents: 0,
      deadline: action.deadline,
      accountIds: [],
      color: GOAL_COLORS[Math.floor(Math.random() * GOAL_COLORS.length)],
      archived: 0,
    });
    return;
  }
  if (action.type === "budget") {
    // já existe orçamento dessa categoria vigente? então só atualiza o limite
    const existing = (await db.budgets.toArray()).find(
      (b) =>
        b.deleted === 0 &&
        b.categoryId === action.categoryId &&
        (b.month === action.month || (b.recurring === 1 && b.month <= action.month)),
    );
    if (existing) {
      await update<Budget>("budgets", existing.id, {
        limitCents: action.limitCents,
      });
      return;
    }
    await create<Budget>("budgets", {
      categoryId: action.categoryId,
      month: action.month,
      limitCents: action.limitCents,
      recurring: 1,
    });
  }
}
