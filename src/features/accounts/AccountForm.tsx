import { useEffect, useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button, Input, Label, Select } from "@/components/ui/primitives";
import { parseMoney, formatMoney } from "@/lib/money";
import { confirmDelete } from "@/lib/utils";
import { create, update, softDelete } from "@/db/repo";
import type { Account, AccountType, Transaction } from "@/db/types";
import { Trash2, Scale } from "lucide-react";

const TYPES: { value: AccountType; label: string }[] = [
  { value: "checking", label: "Conta corrente" },
  { value: "savings", label: "Poupança" },
  { value: "cash", label: "Dinheiro" },
  { value: "credit_card", label: "Cartão de crédito" },
  { value: "investment", label: "Investimento" },
];

const CURRENCIES = ["BRL", "USD", "EUR", "GBP", "ARS", "BTC"];
const COLORS = [
  "#6366f1",
  "#16a34a",
  "#f59e0b",
  "#0ea5e9",
  "#ec4899",
  "#ef4444",
  "#8b5cf6",
  "#14b8a6",
];

export function AccountForm({
  open,
  onOpenChange,
  editing,
  defaultType = "checking",
  currentBalance,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing?: Account;
  defaultType?: AccountType;
  /** saldo atual (pra "Ajustar saldo" ao editar contas não-cartão) */
  currentBalance?: number;
  /** chamado com a conta recém-criada (para seleção inline) */
  onCreated?: (acc: Account) => void;
}) {
  const [name, setName] = useState("");
  const [type, setType] = useState<AccountType>(defaultType);
  const [currency, setCurrency] = useState("BRL");
  const [initial, setInitial] = useState("");
  const [color, setColor] = useState(COLORS[0]);
  const [statementDay, setStatementDay] = useState("1");
  const [dueDay, setDueDay] = useState("10");
  const [limit, setLimit] = useState("");
  const [last4, setLast4] = useState("");
  const [adjustReal, setAdjustReal] = useState("");
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setName(editing.name);
      setType(editing.type);
      setCurrency(editing.currency);
      setInitial((editing.initialBalanceCents / 100).toString().replace(".", ","));
      setColor(editing.color);
      setStatementDay(String(editing.statementDay ?? 1));
      setDueDay(String(editing.dueDay ?? 10));
      setLimit(
        editing.creditLimitCents
          ? (editing.creditLimitCents / 100).toString().replace(".", ",")
          : "",
      );
      setLast4(editing.cardLast4 ?? "");
    } else {
      setName("");
      setType(defaultType);
      setCurrency("BRL");
      setInitial("");
      setColor(COLORS[0]);
      setStatementDay("1");
      setDueDay("10");
      setLimit("");
      setLast4("");
    }
    setAdjustOpen(false);
    setAdjustReal("");
    setError("");
  }, [open, editing, defaultType]);

  /** cria um lançamento de acerto pra bater com o saldo real informado */
  async function applyAdjust() {
    if (!editing || currentBalance === undefined) return;
    const real = parseMoney(adjustReal);
    if (real === null) {
      setError("Informe o saldo real.");
      return;
    }
    const diff = real - currentBalance;
    if (diff !== 0) {
      await create<Transaction>("transactions", {
        accountId: editing.id,
        toAccountId: null,
        categoryId: null,
        kind: diff > 0 ? "income" : "expense",
        amountCents: Math.abs(diff),
        currency: editing.currency,
        date: new Date().toISOString().slice(0, 10),
        description: "Ajuste de saldo",
        tags: ["ajuste"],
        status: "cleared",
      });
    }
    onOpenChange(false);
  }

  async function handleSubmit() {
    if (!name.trim()) {
      setError("Dê um nome à conta.");
      return;
    }
    const isCard = type === "credit_card";
    const data = {
      name: name.trim(),
      type,
      currency,
      initialBalanceCents: parseMoney(initial) ?? 0,
      color,
      icon: isCard ? "credit-card" : "wallet",
      archived: 0 as const,
      order: editing?.order ?? Date.now(),
      creditLimitCents: isCard ? (parseMoney(limit) ?? undefined) : undefined,
      statementDay: isCard ? Number(statementDay) : undefined,
      dueDay: isCard ? Number(dueDay) : undefined,
      cardLast4: isCard
        ? last4.replace(/\D/g, "").slice(-4) || undefined
        : undefined,
    };
    if (editing) {
      await update<Account>("accounts", editing.id, data);
    } else {
      const created = await create<Account>("accounts", data);
      onCreated?.(created);
    }
    onOpenChange(false);
  }

  async function handleDelete() {
    if (editing && confirmDelete("esta conta (os lançamentos ligados a ela continuam)")) {
      await softDelete("accounts", editing.id);
      onOpenChange(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={editing ? "Editar conta" : "Nova conta"}>
        <div className="space-y-4">
          <div>
            <Label>Nome</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex.: Nubank, Carteira…"
              autoFocus
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Tipo</Label>
              <Select
                value={type}
                onChange={(e) => setType(e.target.value as AccountType)}
              >
                {TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Moeda</Label>
              <Select
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
              >
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <div>
            <Label>
              {type === "credit_card" ? "Saldo inicial da fatura" : "Saldo inicial"}
            </Label>
            <Input
              inputMode="decimal"
              placeholder="0,00"
              value={initial}
              onChange={(e) => setInitial(e.target.value)}
              className="tabular"
            />
          </div>

          {type === "credit_card" && (
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>Limite</Label>
                <Input
                  inputMode="decimal"
                  placeholder="0,00"
                  value={limit}
                  onChange={(e) => setLimit(e.target.value)}
                  className="tabular"
                />
              </div>
              <div>
                <Label>Fecha dia</Label>
                <Input
                  type="number"
                  min={1}
                  max={31}
                  value={statementDay}
                  onChange={(e) => setStatementDay(e.target.value)}
                />
              </div>
              <div>
                <Label>Vence dia</Label>
                <Input
                  type="number"
                  min={1}
                  max={31}
                  value={dueDay}
                  onChange={(e) => setDueDay(e.target.value)}
                />
              </div>
            </div>
          )}

          {type === "credit_card" && (
            <div>
              <Label>Final do cartão (opcional)</Label>
              <Input
                inputMode="numeric"
                maxLength={4}
                placeholder="ex.: 1234"
                value={last4}
                onChange={(e) => setLast4(e.target.value.replace(/\D/g, ""))}
                className="tabular"
              />
            </div>
          )}

          <div>
            <Label>Cor</Label>
            <div className="flex flex-wrap gap-2">
              {COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  className="h-8 w-8 rounded-full border-2 transition-transform"
                  style={{
                    backgroundColor: c,
                    borderColor: color === c ? "var(--text)" : "transparent",
                    transform: color === c ? "scale(1.1)" : "scale(1)",
                  }}
                />
              ))}
            </div>
          </div>

          {/* Ajustar saldo (contas não-cartão, ao editar) */}
          {editing && type !== "credit_card" && currentBalance !== undefined && (
            <div className="rounded-xl border border-border bg-surface-2/40 p-3">
              {!adjustOpen ? (
                <button
                  type="button"
                  onClick={() => {
                    setAdjustReal(
                      (currentBalance / 100).toString().replace(".", ","),
                    );
                    setAdjustOpen(true);
                  }}
                  className="flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
                >
                  <Scale size={15} /> Ajustar saldo (atual:{" "}
                  {formatMoney(currentBalance, currency)})
                </button>
              ) : (
                <div className="space-y-2">
                  <Label className="mb-0">Saldo real da conta</Label>
                  <Input
                    inputMode="decimal"
                    placeholder="0,00"
                    value={adjustReal}
                    onChange={(e) => setAdjustReal(e.target.value)}
                    className="tabular"
                    autoFocus
                  />
                  <p className="text-xs text-muted">
                    Cria um lançamento de “Ajuste de saldo” pra bater com esse
                    valor.
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setAdjustOpen(false)}
                    >
                      Cancelar
                    </Button>
                    <Button size="sm" onClick={applyAdjust}>
                      Aplicar ajuste
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}

          {error && <p className="text-sm text-expense">{error}</p>}

          <div className="flex items-center justify-between gap-2 pt-2">
            {editing ? (
              <Button variant="ghost" size="icon" onClick={handleDelete}>
                <Trash2 size={18} className="text-expense" />
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button onClick={handleSubmit}>Salvar</Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
