import Dexie, { type Table } from "dexie";
import type {
  Account,
  Attachment,
  Budget,
  Category,
  ExchangeRate,
  Goal,
  Recurrence,
  Setting,
  Transaction,
} from "./types";

/**
 * Banco local (IndexedDB) via Dexie. É a fonte de verdade no dispositivo;
 * o motor de sync (lib/sync) replica para o Supabase.
 *
 * Índices escolhidos para as consultas mais comuns:
 *  - transactions por data, conta, categoria e flag `dirty`
 *  - budgets por mês, recurrences por nextDate
 */
export class FinanceDB extends Dexie {
  accounts!: Table<Account, string>;
  categories!: Table<Category, string>;
  transactions!: Table<Transaction, string>;
  budgets!: Table<Budget, string>;
  goals!: Table<Goal, string>;
  recurrences!: Table<Recurrence, string>;
  attachments!: Table<Attachment, string>;
  exchangeRates!: Table<ExchangeRate, string>;
  settings!: Table<Setting, string>;

  constructor() {
    super("financeiro");
    this.version(1).stores({
      accounts: "id, type, archived, order, dirty, updatedAt",
      categories: "id, kind, parentId, order, dirty, updatedAt",
      transactions:
        "id, date, accountId, toAccountId, categoryId, kind, status, recurrenceId, installmentId, transferPairId, dirty, updatedAt, [accountId+date], [categoryId+date]",
      budgets: "id, [categoryId+month], month, dirty, updatedAt",
      goals: "id, archived, dirty, updatedAt",
      recurrences: "id, nextDate, active, dirty, updatedAt",
      attachments: "id, transactionId, dirty, updatedAt",
      exchangeRates: "id, [base+quote], date",
      settings: "key",
    });
  }
}

export const db = new FinanceDB();

/** Tabelas sincronizáveis (têm SyncFields). Usadas pelo motor de sync. */
export const SYNCABLE_TABLES = [
  "accounts",
  "categories",
  "transactions",
  "budgets",
  "goals",
  "recurrences",
  "attachments",
] as const;

export type SyncableTable = (typeof SYNCABLE_TABLES)[number];
