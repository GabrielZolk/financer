import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { ArrowLeft, ArrowUpRight, Lightbulb, Merge, Pencil, Trash2, X } from "lucide-react";
import { db } from "@/db/schema";
import type { Transaction } from "@/db/types";
import {
  computeTagStats,
  sortTagStats,
  findDuplicatePairs,
  type TagSort,
  type TagStat,
} from "@/lib/calc/tags";
import { mergeTags, renameTag, deleteTag } from "@/lib/tags-ops";
import { formatMoney } from "@/lib/money";
import { Button, Card, EmptyState, Input } from "@/components/ui/primitives";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { PageHeader } from "@/components/PageHeader";

/* paleta estável por hash da tag (tags não guardam cor) */
const PALETTE = [
  "#6366f1", "#16a34a", "#ec4899", "#0ea5e9", "#f59e0b",
  "#8b5cf6", "#14b8a6", "#dc2626", "#a855f7", "#65a30d",
  "#ef4444", "#0891b2",
];
function tagColor(tag: string): string {
  let h = 0;
  for (let i = 0; i < tag.length; i++) h = (h * 31 + tag.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

const SORTS: { value: TagSort; label: string }[] = [
  { value: "uses", label: "Mais usadas" },
  { value: "total", label: "Maior total" },
  { value: "alpha", label: "A–Z" },
];

export function TagsPage() {
  const navigate = useNavigate();
  const txs = useLiveQuery(
    async () => (await db.transactions.toArray()) as Transaction[],
    [],
    [] as Transaction[],
  );

  const stats = useMemo(() => computeTagStats(txs), [txs]);

  const [sort, setSort] = useState<TagSort>("uses");
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  // diálogos
  const [renaming, setRenaming] = useState<string | null>(null);
  const [merging, setMerging] = useState<string[] | null>(null);

  const sorted = useMemo(() => sortTagStats(stats, sort), [stats, sort]);
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? sorted.filter((s) => s.tag.toLowerCase().includes(q)) : sorted;
  }, [sorted, query]);

  // tamanho do chip pela frequência (12–20px), escala baseada no conjunto todo
  const sizeScale = useMemo(() => {
    const counts = stats.map((s) => s.count);
    const min = Math.min(...counts, 1);
    const max = Math.max(...counts, 1);
    return (c: number) => {
      if (max === min) return 14;
      return 12 + ((c - min) / (max - min)) * 8;
    };
  }, [stats]);

  const dupes = useMemo(() => findDuplicatePairs(stats), [stats]);
  const dupe = dupes.find(([a, b]) => !dismissed.has(`${a}|${b}`));

  const focusedStat = focused ? stats.find((s) => s.tag === focused) ?? null : null;

  function toggleSelect(tag: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(tag)) next.delete(tag);
      else next.add(tag);
      return next;
    });
  }
  function onChipClick(e: React.MouseEvent, tag: string) {
    if (e.metaKey || e.ctrlKey) toggleSelect(tag);
    else setFocused(tag);
  }
  function clearSelection() {
    setSelected(new Set());
  }

  async function doDelete(tag: string) {
    if (!confirm(`Remover a tag "#${tag}" de todos os lançamentos? Os lançamentos não são apagados.`))
      return;
    await deleteTag(tag);
    setFocused((f) => (f === tag ? null : f));
    setSelected((prev) => {
      const n = new Set(prev);
      n.delete(tag);
      return n;
    });
  }
  async function doDeleteSelected() {
    const list = [...selected];
    if (!list.length) return;
    if (!confirm(`Remover ${list.length} tags de todos os lançamentos?`)) return;
    for (const t of list) await deleteTag(t);
    clearSelection();
    setFocused((f) => (f && list.includes(f) ? null : f));
  }

  if (stats.length === 0) {
    return (
      <div>
        <BackLink />
        <PageHeader title="Tags" subtitle="Organize seus lançamentos por marcadores" />
        <EmptyState
          icon={<span className="text-2xl">🏷️</span>}
          title="Nenhuma tag ainda"
          description="Adicione tags ao criar um lançamento (campo “Tags”). Elas aparecem aqui para você renomear, mesclar e ver gastos."
        />
      </div>
    );
  }

  return (
    <div>
      <BackLink />
      <PageHeader
        title="Tags"
        subtitle={`${stats.length} ${stats.length === 1 ? "tag" : "tags"} · uso e gasto por marcador`}
      />

      <Card className="overflow-hidden p-0">
        {/* toolbar */}
        <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
          <div className="flex rounded-xl border border-border bg-surface-2 p-0.5">
            {SORTS.map((s) => (
              <button
                key={s.value}
                onClick={() => setSort(s.value)}
                className={
                  "rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors " +
                  (sort === s.value
                    ? "bg-surface text-text shadow-sm"
                    : "text-muted hover:text-text")
                }
              >
                {s.label}
              </button>
            ))}
          </div>
          <Input
            type="search"
            autoComplete="off"
            placeholder="🔍 buscar tag…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="ml-auto h-9 w-auto min-w-[160px] flex-1 sm:max-w-[220px] sm:flex-none"
          />
        </div>

        {/* detector de duplicadas */}
        {dupe && (
          <div
            className="flex items-center gap-2.5 border-b border-border px-4 py-2.5 text-sm"
            style={{ background: "color-mix(in srgb, #f59e0b 10%, var(--surface))" }}
          >
            <Lightbulb size={16} className="shrink-0 text-amber-500" />
            <span className="min-w-0">
              Possíveis duplicadas: <b>#{dupe[0]}</b> e <b>#{dupe[1]}</b> — mesclar numa só?
            </span>
            <Button
              size="sm"
              className="ml-auto h-7"
              onClick={() => setMerging([dupe[0], dupe[1]])}
            >
              Mesclar
            </Button>
            <button
              title="dispensar"
              onClick={() => setDismissed((p) => new Set(p).add(`${dupe[0]}|${dupe[1]}`))}
              className="rounded-md p-1 text-muted hover:bg-surface-2"
            >
              <X size={16} />
            </button>
          </div>
        )}

        {/* barra de seleção em lote */}
        {selected.size >= 2 && (
          <div
            className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2.5 text-sm"
            style={{ background: "color-mix(in srgb, var(--primary) 9%, var(--surface))" }}
          >
            <b className="text-primary">{selected.size} selecionadas</b>
            <Button
              size="sm"
              className="ml-auto h-7"
              onClick={() => setMerging([...selected])}
            >
              <Merge size={14} /> Mesclar em uma…
            </Button>
            <Button size="sm" variant="outline" className="h-7 text-expense" onClick={doDeleteSelected}>
              <Trash2 size={14} /> Excluir
            </Button>
            <Button size="sm" variant="ghost" className="h-7" onClick={clearSelection}>
              Limpar
            </Button>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-[1.45fr_1fr]">
          {/* nuvem */}
          <div className="flex flex-wrap content-start gap-2.5 border-border p-4 sm:border-r">
            {visible.length === 0 ? (
              <p className="py-4 text-sm text-muted">Nenhuma tag encontrada.</p>
            ) : (
              visible.map((s) => {
                const isSel = selected.has(s.tag);
                const isFocus = focused === s.tag;
                return (
                  <button
                    key={s.tag}
                    onClick={(e) => onChipClick(e, s.tag)}
                    style={{ fontSize: `${sizeScale(s.count).toFixed(1)}px` }}
                    className={
                      "inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 leading-none transition-all hover:-translate-y-0.5 " +
                      (isFocus
                        ? "border-primary bg-primary/10 "
                        : "border-border bg-surface-2 hover:border-primary ") +
                      (isSel ? "ring-2 ring-primary ring-offset-1 ring-offset-surface" : "")
                    }
                  >
                    {isSel && (
                      <span className="-ml-0.5 grid h-[15px] w-[15px] place-items-center rounded-[5px] bg-primary text-[10px] text-white">
                        ✓
                      </span>
                    )}
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ background: tagColor(s.tag) }}
                    />
                    <span className={"font-bold " + (isFocus ? "text-primary" : "")}>
                      #{s.tag}
                    </span>
                    <span className="rounded-full bg-surface px-1.5 py-0.5 text-[11px] tabular text-muted">
                      {s.count}
                    </span>
                  </button>
                );
              })
            )}
          </div>

          {/* detalhe */}
          <div className="p-5">
            {focusedStat ? (
              <TagDetail
                stat={focusedStat}
                onRename={() => setRenaming(focusedStat.tag)}
                onMerge={() => setMerging([focusedStat.tag])}
                onDelete={() => doDelete(focusedStat.tag)}
                onSee={() =>
                  navigate(`/transactions?tag=${encodeURIComponent(focusedStat.tag)}`)
                }
              />
            ) : (
              <div className="flex h-full flex-col items-center justify-center py-8 text-center text-sm text-muted">
                <span className="mb-2 text-2xl">🏷️</span>
                Toque numa tag para ver detalhes.
                <span className="mt-3 text-[11px]">
                  ⌘/Ctrl + clique seleciona várias para mesclar em lote.
                </span>
              </div>
            )}
          </div>
        </div>
      </Card>

      <RenameDialog
        tag={renaming}
        onClose={() => setRenaming(null)}
        onDone={(to) => {
          setFocused((f) => (f === renaming ? to : f));
          setRenaming(null);
        }}
      />
      <MergeDialog
        sources={merging}
        allTags={stats.map((s) => s.tag)}
        onClose={() => setMerging(null)}
        onDone={(target) => {
          setMerging(null);
          clearSelection();
          setFocused(target);
        }}
      />
    </div>
  );
}

function BackLink() {
  return (
    <Link
      to="/settings"
      className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-text"
    >
      <ArrowLeft size={16} /> Ajustes
    </Link>
  );
}

function TagDetail({
  stat,
  onRename,
  onMerge,
  onDelete,
  onSee,
}: {
  stat: TagStat;
  onRename: () => void;
  onMerge: () => void;
  onDelete: () => void;
  onSee: () => void;
}) {
  const max = Math.max(...stat.monthly, 1);
  return (
    <div>
      <div className="flex items-center gap-2.5">
        <span className="h-3.5 w-3.5 rounded-full" style={{ background: tagColor(stat.tag) }} />
        <h2 className="text-xl font-extrabold">#{stat.tag}</h2>
      </div>
      <p className="mt-0.5 text-xs text-muted">
        {stat.firstUse ? `Primeiro uso em ${monthYear(stat.firstUse)}` : "—"}
        {stat.accountIds.length > 0 &&
          ` · em ${stat.accountIds.length} ${stat.accountIds.length === 1 ? "conta" : "contas"}`}
      </p>

      <div className="my-4 grid grid-cols-2 gap-2.5">
        <div className="rounded-xl bg-surface-2 px-3 py-2.5">
          <div className="text-[11.5px] text-muted">Lançamentos</div>
          <div className="mt-0.5 text-lg font-extrabold tabular">{stat.count}</div>
        </div>
        <div className="rounded-xl bg-surface-2 px-3 py-2.5">
          <div className="text-[11.5px] text-muted">Total gasto</div>
          <div className="mt-0.5 text-lg font-extrabold tabular text-expense">
            {formatMoney(stat.totalCents)}
          </div>
        </div>
      </div>

      <div className="mb-4">
        <div className="mb-1.5 text-[11.5px] text-muted">Gasto nos últimos 6 meses</div>
        <div className="flex h-12 items-end gap-1">
          {stat.monthly.map((v, i) => (
            <div
              key={i}
              className="bar-grow flex-1 rounded-t"
              style={{
                height: `${Math.max((v / max) * 100, 3)}%`,
                background: "var(--primary)",
                opacity: i === stat.monthly.length - 1 ? 0.85 : 0.38,
                animationDelay: `${i * 40}ms`,
              }}
              title={formatMoney(v)}
            />
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={onRename}>
          <Pencil size={14} /> Renomear
        </Button>
        <Button variant="outline" size="sm" onClick={onMerge}>
          <Merge size={14} /> Mesclar com…
        </Button>
        <Button variant="outline" size="sm" className="text-expense" onClick={onDelete}>
          <Trash2 size={14} /> Excluir
        </Button>
      </div>

      <button
        onClick={onSee}
        className="mt-3.5 inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-primary hover:underline"
      >
        <ArrowUpRight size={14} /> Ver {stat.count} {stat.count === 1 ? "lançamento" : "lançamentos"} com #{stat.tag}
      </button>
    </div>
  );
}

function RenameDialog({
  tag,
  onClose,
  onDone,
}: {
  tag: string | null;
  onClose: () => void;
  onDone: (to: string) => void;
}) {
  const open = tag !== null;
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent title="Renomear tag" className="max-w-sm">
        <RenameBody key={tag ?? ""} tag={tag} onClose={onClose} onDone={onDone} />
      </DialogContent>
    </Dialog>
  );
}

function RenameBody({
  tag,
  onClose,
  onDone,
}: {
  tag: string | null;
  onClose: () => void;
  onDone: (to: string) => void;
}) {
  const [value, setValue] = useState(tag ?? "");
  const [busy, setBusy] = useState(false);
  async function save() {
    const to = value.trim().replace(/^#/, "");
    if (!tag || !to || to === tag) {
      onClose();
      return;
    }
    setBusy(true);
    await renameTag(tag, to);
    setBusy(false);
    onDone(to);
  }
  return (
    <div>
      <p className="mb-2 text-sm text-muted">
        Renomeia <b>#{tag}</b> em todos os lançamentos onde aparece.
      </p>
      <Input
        value={value}
        autoFocus
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && save()}
        placeholder="novo nome"
      />
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>
          Cancelar
        </Button>
        <Button onClick={save} disabled={busy}>
          Salvar
        </Button>
      </div>
    </div>
  );
}

function MergeDialog({
  sources,
  allTags,
  onClose,
  onDone,
}: {
  sources: string[] | null;
  allTags: string[];
  onClose: () => void;
  onDone: (target: string) => void;
}) {
  const open = sources !== null;
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent title="Mesclar tags" className="max-w-sm">
        <MergeBody
          key={(sources ?? []).join("|")}
          sources={sources ?? []}
          allTags={allTags}
          onClose={onClose}
          onDone={onDone}
        />
      </DialogContent>
    </Dialog>
  );
}

function MergeBody({
  sources,
  allTags,
  onClose,
  onDone,
}: {
  sources: string[];
  allTags: string[];
  onClose: () => void;
  onDone: (target: string) => void;
}) {
  // sugestão de destino: a 1ª das fontes (mais usada, quando veio da seleção)
  const [target, setTarget] = useState(sources[0] ?? "");
  const [busy, setBusy] = useState(false);
  const others = allTags.filter((t) => !sources.includes(t));

  async function save() {
    const to = target.trim().replace(/^#/, "");
    if (!to) return;
    setBusy(true);
    // mescla todas as fontes (menos a que virou destino) no destino
    await mergeTags(
      sources.filter((s) => s !== to),
      to,
    );
    setBusy(false);
    onDone(to);
  }

  return (
    <div>
      <p className="mb-2 text-sm text-muted">
        {sources.length > 1 ? (
          <>
            Mesclar{" "}
            {sources.map((s) => (
              <b key={s}>#{s} </b>
            ))}
            em uma só tag:
          </>
        ) : (
          <>
            Mesclar <b>#{sources[0]}</b> em outra tag (some e vira a escolhida):
          </>
        )}
      </p>
      <Input
        list="merge-targets"
        value={target}
        autoFocus
        onChange={(e) => setTarget(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && save()}
        placeholder="tag de destino"
      />
      <datalist id="merge-targets">
        {sources.length > 1
          ? sources.map((t) => <option key={t} value={t} />)
          : others.map((t) => <option key={t} value={t} />)}
      </datalist>
      <p className="mt-2 text-xs text-muted">
        Pode escolher uma existente ou digitar um nome novo.
      </p>
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>
          Cancelar
        </Button>
        <Button onClick={save} disabled={busy || !target.trim()}>
          Mesclar
        </Button>
      </div>
    </div>
  );
}

function monthYear(date: string): string {
  const d = new Date(date + "T00:00:00");
  return d.toLocaleDateString("pt-BR", { month: "short", year: "numeric" });
}
