/**
 * Modelo de dados. Todas as entidades sincronizáveis estendem `SyncFields`.
 * Valores monetários sempre em centavos inteiros (ver lib/money.ts).
 */

export interface SyncFields {
  id: string;
  /** dono do registro (preenchido ao logar no Supabase; "local" enquanto offline-only) */
  userId: string;
  createdAt: string; // ISO
  updatedAt: string; // ISO — base do last-write-wins
  /** soft delete: registros marcados não somem do banco até o sync confirmar */
  deleted: 0 | 1;
  /** 1 = alteração local pendente de envio ao servidor */
  dirty: 0 | 1;
}

export type AccountType =
  | "checking" // conta corrente
  | "savings" // poupança
  | "cash" // dinheiro
  | "credit_card" // cartão de crédito
  | "investment"; // investimento

export interface Account extends SyncFields {
  name: string;
  type: AccountType;
  currency: string; // ISO 4217, ex.: "BRL"
  initialBalanceCents: number;
  color: string;
  icon: string;
  archived: 0 | 1;
  /** ordem de exibição */
  order: number;
  // Cartão de crédito:
  creditLimitCents?: number;
  /** dia de fechamento da fatura (1-31) */
  statementDay?: number;
  /** dia de vencimento da fatura (1-31) */
  dueDay?: number;
  /** últimos 4 dígitos (só decoração no cartão estilizado) */
  cardLast4?: string;
}

export type CategoryKind = "income" | "expense";

export interface Category extends SyncFields {
  name: string;
  kind: CategoryKind;
  parentId: string | null;
  color: string;
  icon: string;
  order: number;
}

export type TransactionKind = "income" | "expense" | "transfer";
export type TransactionStatus = "cleared" | "pending";

/** Sub-item de um lançamento dividido (split). A soma de amountCents = total do pai. */
export interface TransactionSplit {
  categoryId: string | null;
  /** subtotal do item (= quantity × unitAmountCents quando informados) */
  amountCents: number;
  description?: string;
  note?: string;
  quantity?: number;
  unitAmountCents?: number;
  tags?: string[];
  /** data própria do item (opcional; padrão = data do lançamento) */
  date?: string;
}

export interface Transaction extends SyncFields {
  accountId: string;
  /** conta destino (apenas para transferências) */
  toAccountId?: string | null;
  categoryId: string | null;
  kind: TransactionKind;
  /** sempre positivo; o sinal é derivado de `kind` */
  amountCents: number;
  currency: string;
  date: string; // YYYY-MM-DD (início, quando houver período)
  /** data fim, quando o lançamento cobre um período (range) */
  endDate?: string | null;
  description: string;
  notes?: string;
  tags: string[];
  status: TransactionStatus;
  attachmentId?: string | null;
  recurrenceId?: string | null;
  /** divisão em sub-categorias; quando presente, a soma = amountCents */
  splits?: TransactionSplit[];
  /** id do grupo de parcelamento */
  installmentId?: string | null;
  /** parcela atual / total (ex.: 3 de 12) */
  installmentNo?: number | null;
  installmentTotal?: number | null;
  /** id do par em transferências (liga as duas pernas) */
  transferPairId?: string | null;
  /** quando é aporte de meta, liga à meta (permite migrar se a conta mudar) */
  goalId?: string | null;
  /** despesa que será reembolsada (ex.: gasto da empresa que sai da sua conta) */
  reimbursable?: 0 | 1;
  /** já recebeu o reembolso (some dos "pendentes a receber") */
  reimbursed?: 0 | 1;
  /** lançamento privado: campos sensíveis ficam cifrados em `enc` */
  private?: 0 | 1;
  /** payload sensível cifrado (AES-GCM, base64) quando private=1 */
  enc?: string;
  iv?: string;
}

export interface Budget extends SyncFields {
  categoryId: string;
  month: string; // YYYY-MM (mês de início, quando recorrente)
  limitCents: number;
  /** 1 = repete todo mês a partir de `month` (até ter um override) */
  recurring?: 0 | 1;
}

export interface Goal extends SyncFields {
  name: string;
  targetCents: number;
  /** aporte inicial / já guardado fora do app */
  savedCents: number;
  deadline?: string | null; // YYYY-MM-DD
  /** @deprecated conta única (modelo antigo); use accountIds */
  accountId?: string | null;
  /** "potes" da meta: contas cujos saldos somados = quanto está guardado */
  accountIds?: string[];
  color: string;
  archived: 0 | 1;
}

export type RecurrenceFrequency =
  | "daily"
  | "weekly"
  | "biweekly"
  | "monthly"
  | "yearly";

export interface Recurrence extends SyncFields {
  description: string;
  kind: TransactionKind;
  amountCents: number;
  accountId: string;
  toAccountId?: string | null;
  categoryId: string | null;
  frequency: RecurrenceFrequency;
  /** próxima data a gerar (YYYY-MM-DD) */
  nextDate: string;
  /** data final opcional */
  endDate?: string | null;
  active: 0 | 1;
}

export interface Attachment extends SyncFields {
  transactionId: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  /** blob guardado localmente; no servidor vai pro Supabase Storage */
  blob?: Blob;
  remoteUrl?: string | null;
  /** caminho no bucket do Storage (ex.: "{userId}/{id}") quando enviado */
  storagePath?: string | null;
}

export interface ExchangeRate {
  /** chave composta base:quote:date */
  id: string;
  base: string;
  quote: string;
  rate: number;
  date: string; // YYYY-MM-DD
}

export interface Setting {
  key: string;
  value: unknown;
}
