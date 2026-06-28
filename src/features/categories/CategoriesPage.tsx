import { useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Plus } from "lucide-react";
import { useCategories } from "@/db/hooks";
import { Button, Card } from "@/components/ui/primitives";
import { CategoryIcon } from "@/components/ui/CategoryIcon";
import { PageHeader } from "@/components/PageHeader";
import { CategoryForm } from "./CategoryForm";
import type { Category, CategoryKind } from "@/db/types";

export function CategoriesPage() {
  const { t } = useTranslation();
  const expense = useCategories("expense");
  const income = useCategories("income");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Category | undefined>();
  const [defaultKind, setDefaultKind] = useState<CategoryKind>("expense");

  function openNew(kind: CategoryKind) {
    setEditing(undefined);
    setDefaultKind(kind);
    setFormOpen(true);
  }
  function openEdit(cat: Category) {
    setEditing(cat);
    setFormOpen(true);
  }

  return (
    <div>
      <Link
        to="/settings"
        className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-text"
      >
        <ArrowLeft size={16} /> {t("cat.backSettings")}
      </Link>
      <PageHeader
        title={t("cat.title")}
        subtitle={t("cat.subtitle")}
        action={
          <Button onClick={() => openNew("expense")}>
            <Plus size={18} /> {t("common.new")}
          </Button>
        }
      />

      <Group title={t("cat.expenses")} items={expense} onEdit={openEdit} onAdd={() => openNew("expense")} />
      <Group title={t("cat.incomes")} items={income} onEdit={openEdit} onAdd={() => openNew("income")} />

      <CategoryForm
        open={formOpen}
        onOpenChange={setFormOpen}
        editing={editing}
        defaultKind={defaultKind}
      />
    </div>
  );
}

function Group({
  title,
  items,
  onEdit,
  onAdd,
}: {
  title: string;
  items: Category[];
  onEdit: (c: Category) => void;
  onAdd: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="mb-5">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-muted">{title}</h2>
        <button
          onClick={onAdd}
          className="text-sm font-medium text-primary hover:underline"
        >
          {t("cat.add")}
        </button>
      </div>
      <Card className="p-2">
        {items.length === 0 ? (
          <p className="px-2 py-3 text-sm text-muted">{t("cat.empty")}</p>
        ) : (
          (() => {
            const ids = new Set(items.map((c) => c.id));
            const tops = items.filter((c) => !c.parentId || !ids.has(c.parentId));
            const childrenOf = (id: string) =>
              items.filter((c) => c.parentId === id);
            return tops.map((c) => (
              <div key={c.id}>
                <button
                  onClick={() => onEdit(c)}
                  className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors hover:bg-surface-2"
                >
                  <CategoryIcon icon={c.icon} color={c.color} size={38} />
                  <span className="flex-1 text-sm font-medium">{c.name}</span>
                </button>
                {childrenOf(c.id).map((ch) => (
                  <button
                    key={ch.id}
                    onClick={() => onEdit(ch)}
                    className="flex w-full items-center gap-2.5 rounded-xl py-1.5 pl-9 pr-2 text-left transition-colors hover:bg-surface-2"
                  >
                    <span className="text-muted">↳</span>
                    <CategoryIcon icon={ch.icon} color={ch.color} size={28} />
                    <span className="flex-1 text-sm">{ch.name}</span>
                  </button>
                ))}
              </div>
            ));
          })()
        )}
      </Card>
    </div>
  );
}
