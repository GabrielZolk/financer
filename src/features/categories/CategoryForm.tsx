import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button, Input, Label, Select } from "@/components/ui/primitives";
import { CategoryIcon } from "@/components/ui/CategoryIcon";
import { ICON_NAMES } from "@/lib/icons";
import { cn, confirmDelete } from "@/lib/utils";
import { create, update, softDelete } from "@/db/repo";
import { useCategories } from "@/db/hooks";
import type { Category, CategoryKind } from "@/db/types";

const COLORS = [
  "#6366f1",
  "#16a34a",
  "#f59e0b",
  "#0ea5e9",
  "#ec4899",
  "#ef4444",
  "#8b5cf6",
  "#14b8a6",
  "#a855f7",
  "#84cc16",
  "#f97316",
  "#64748b",
];

export function CategoryForm({
  open,
  onOpenChange,
  editing,
  defaultKind = "expense",
  onCreated,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  editing?: Category;
  defaultKind?: CategoryKind;
  /** chamado com a categoria recém-criada (para seleção inline) */
  onCreated?: (cat: Category) => void;
}) {
  const [name, setName] = useState("");
  const [kind, setKind] = useState<CategoryKind>(defaultKind);
  const [parentId, setParentId] = useState("");
  const [color, setColor] = useState(COLORS[0]);
  const [icon, setIcon] = useState(ICON_NAMES[0]);
  const [error, setError] = useState("");

  // possíveis pais: categorias do mesmo tipo, de 1º nível, exceto a própria
  const sameKind = useCategories(kind);
  const parentOptions = sameKind.filter(
    (c) => !c.parentId && c.id !== editing?.id,
  );

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setName(editing.name);
      setKind(editing.kind);
      setParentId(editing.parentId ?? "");
      setColor(editing.color);
      setIcon(editing.icon);
    } else {
      setName("");
      setKind(defaultKind);
      setParentId("");
      setColor(COLORS[0]);
      setIcon(ICON_NAMES[0]);
    }
    setError("");
  }, [open, editing, defaultKind]);

  async function handleSubmit() {
    if (!name.trim()) {
      setError("Dê um nome à categoria.");
      return;
    }
    const data = {
      name: name.trim(),
      kind,
      parentId: parentId || null,
      color,
      icon,
      order: editing?.order ?? Date.now(),
    };
    if (editing) {
      await update<Category>("categories", editing.id, data);
    } else {
      const created = await create<Category>("categories", data);
      onCreated?.(created);
    }
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={editing ? "Editar categoria" : "Nova categoria"}>
        <div className="space-y-4">
          {/* preview + nome */}
          <div className="flex items-center gap-3">
            <CategoryIcon icon={icon} color={color} size={48} />
            <div className="flex-1">
              <Label>Nome</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex.: Mercado, Pets, Academia"
                autoFocus
              />
            </div>
          </div>

          {/* tipo */}
          <div className="grid grid-cols-2 gap-1 rounded-xl bg-surface-2 p-1">
            {(["expense", "income"] as const).map((k) => (
              <button
                key={k}
                onClick={() => setKind(k)}
                className={cn(
                  "rounded-lg py-2 text-sm font-medium transition-colors",
                  kind === k
                    ? k === "income"
                      ? "bg-surface text-income shadow-sm"
                      : "bg-surface text-expense shadow-sm"
                    : "text-muted",
                )}
              >
                {k === "income" ? "Receita" : "Despesa"}
              </button>
            ))}
          </div>

          {/* categoria pai (subcategoria) */}
          {parentOptions.length > 0 && (
            <div>
              <Label>Categoria pai (opcional)</Label>
              <Select
                value={parentId}
                onChange={(e) => setParentId(e.target.value)}
              >
                <option value="">Nenhuma (categoria principal)</option>
                {parentOptions.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </div>
          )}

          {/* cor */}
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
                    transform: color === c ? "scale(1.12)" : "scale(1)",
                  }}
                />
              ))}
            </div>
          </div>

          {/* ícone */}
          <div>
            <Label>Ícone</Label>
            <div className="grid grid-cols-7 gap-2">
              {ICON_NAMES.map((n) => (
                <button
                  key={n}
                  onClick={() => setIcon(n)}
                  className={cn(
                    "flex items-center justify-center rounded-xl border p-1 transition-colors",
                    icon === n
                      ? "border-primary bg-primary/10"
                      : "border-transparent hover:bg-surface-2",
                  )}
                >
                  <CategoryIcon icon={n} color={color} size={32} />
                </button>
              ))}
            </div>
          </div>

          {error && <p className="text-sm text-expense">{error}</p>}

          <div className="flex items-center justify-between gap-2 pt-1">
            {editing ? (
              <Button
                variant="ghost"
                size="icon"
                onClick={async () => {
                  if (!confirmDelete("esta categoria")) return;
                  await softDelete("categories", editing.id);
                  onOpenChange(false);
                }}
              >
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
