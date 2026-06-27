import { db } from "./schema";
import { create } from "./repo";
import type { Account, Category } from "./types";

const DEFAULT_EXPENSE_CATEGORIES: Array<[string, string, string]> = [
  // [nome, cor, ícone]
  ["Moradia", "#6366f1", "home"],
  ["Alimentação", "#f59e0b", "utensils"],
  ["Transporte", "#0ea5e9", "car"],
  ["Saúde", "#ef4444", "heart-pulse"],
  ["Lazer", "#ec4899", "gamepad-2"],
  ["Educação", "#8b5cf6", "graduation-cap"],
  ["Compras", "#14b8a6", "shopping-bag"],
  ["Assinaturas", "#a855f7", "repeat"],
  ["Contas", "#64748b", "file-text"],
  ["Outros", "#94a3b8", "ellipsis"],
];

const DEFAULT_INCOME_CATEGORIES: Array<[string, string, string]> = [
  ["Salário", "#16a34a", "briefcase"],
  ["Freelance", "#22c55e", "laptop"],
  ["Investimentos", "#10b981", "trending-up"],
  ["Presente", "#84cc16", "gift"],
  ["Outros", "#94a3b8", "ellipsis"],
];

/** Popula categorias e contas padrão na primeira execução. */
export async function seedIfEmpty(): Promise<void> {
  const catCount = await db.categories.count();
  if (catCount === 0) {
    let order = 0;
    for (const [name, color, icon] of DEFAULT_EXPENSE_CATEGORIES) {
      await create<Category>("categories", {
        name,
        kind: "expense",
        parentId: null,
        color,
        icon,
        order: order++,
      });
    }
    order = 0;
    for (const [name, color, icon] of DEFAULT_INCOME_CATEGORIES) {
      await create<Category>("categories", {
        name,
        kind: "income",
        parentId: null,
        color,
        icon,
        order: order++,
      });
    }
  }

  const accCount = await db.accounts.count();
  if (accCount === 0) {
    await create<Account>("accounts", {
      name: "Carteira",
      type: "cash",
      currency: "BRL",
      initialBalanceCents: 0,
      color: "#16a34a",
      icon: "wallet",
      archived: 0,
      order: 0,
    });
    await create<Account>("accounts", {
      name: "Conta Corrente",
      type: "checking",
      currency: "BRL",
      initialBalanceCents: 0,
      color: "#6366f1",
      icon: "landmark",
      archived: 0,
      order: 1,
    });
  }
}
