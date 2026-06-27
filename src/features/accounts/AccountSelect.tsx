import { useState } from "react";
import { Select } from "@/components/ui/primitives";
import { AccountForm } from "./AccountForm";
import type { Account, AccountType } from "@/db/types";

const NEW = "__new_acc__";

/**
 * Seletor de conta com criação inline ("+ Nova conta…"). Mesma filosofia do
 * seletor de categoria: todo lugar que escolhe uma conta também deixa criar.
 */
export function AccountSelect({
  value,
  onChange,
  accounts,
  exclude,
  includeNone,
  noneLabel = "Nenhuma",
  defaultType = "checking",
  className,
}: {
  value: string;
  onChange: (id: string) => void;
  accounts: Account[];
  /** esconde esta conta da lista (ex.: a conta de destino numa transferência) */
  exclude?: string;
  /** inclui uma opção vazia (ex.: "Sem conta") */
  includeNone?: boolean;
  noneLabel?: string;
  /** tipo padrão ao criar uma conta nova daqui (ex.: "savings" pra cofrinho) */
  defaultType?: AccountType;
  className?: string;
}) {
  const [formOpen, setFormOpen] = useState(false);
  const list = exclude ? accounts.filter((a) => a.id !== exclude) : accounts;

  return (
    <>
      <Select
        value={value}
        className={className}
        onChange={(e) =>
          e.target.value === NEW ? setFormOpen(true) : onChange(e.target.value)
        }
      >
        {includeNone && <option value="">{noneLabel}</option>}
        {list.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name}
          </option>
        ))}
        <option value={NEW}>+ Nova conta…</option>
      </Select>
      <AccountForm
        open={formOpen}
        onOpenChange={setFormOpen}
        defaultType={defaultType}
        onCreated={(acc) => onChange(acc.id)}
      />
    </>
  );
}
