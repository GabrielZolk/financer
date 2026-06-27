import { useRef, useState } from "react";
import {
  Download,
  Upload,
  Moon,
  Sun,
  Monitor,
  Repeat,
  ChevronRight,
  FileSpreadsheet,
  Tag,
  Tags,
} from "lucide-react";
import { Link } from "react-router-dom";
import { Button, Card, Label, Select } from "@/components/ui/primitives";
import { PageHeader } from "@/components/PageHeader";
import { useSettings, setSetting, applyTheme } from "@/lib/settings";
import {
  downloadBackup,
  downloadCsv,
  importBackup,
  type BackupFile,
} from "@/lib/backup";
import { SyncCard } from "@/features/sync/SyncCard";
import { AppLockCard } from "@/features/applock/AppLockCard";
import { ImportDialog } from "@/features/import/ImportDialog";
import { CurrencyRatesCard } from "./CurrencyRatesCard";

const THEMES = [
  { value: "system", label: "Sistema", icon: Monitor },
  { value: "light", label: "Claro", icon: Sun },
  { value: "dark", label: "Escuro", icon: Moon },
] as const;

export function SettingsPage() {
  const settings = useSettings();
  const fileRef = useRef<HTMLInputElement>(null);
  const [importOpen, setImportOpen] = useState(false);

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const json = JSON.parse(await file.text()) as BackupFile;
      await importBackup(json);
      alert("Backup importado com sucesso.");
    } catch (err) {
      alert("Falha ao importar: " + (err as Error).message);
    }
    e.target.value = "";
  }

  return (
    <div>
      <PageHeader title="Ajustes" />

      {/* Aparência */}
      <Card className="mb-4">
        <h2 className="mb-3 text-base font-semibold">Aparência</h2>
        <Label>Tema</Label>
        <div className="grid grid-cols-3 gap-2">
          {THEMES.map((t) => (
            <button
              key={t.value}
              onClick={() => {
                setSetting("theme", t.value);
                applyTheme(t.value);
              }}
              className={`flex flex-col items-center gap-1 rounded-xl border py-3 text-sm transition-colors ${
                settings.theme === t.value
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted hover:bg-surface-2"
              }`}
            >
              <t.icon size={18} />
              {t.label}
            </button>
          ))}
        </div>
      </Card>

      {/* Câmbio (multi-moeda) */}
      <CurrencyRatesCard />

      {/* Importar extrato */}
      <Card className="mb-4">
        <div className="flex items-center gap-3">
          <FileSpreadsheet size={18} className="text-muted" />
          <div className="flex-1">
            <p className="font-semibold">Importar extrato</p>
            <p className="text-sm text-muted">
              Traga lançamentos de um arquivo CSV ou OFX do banco.
            </p>
          </div>
          <Button variant="outline" onClick={() => setImportOpen(true)}>
            Importar
          </Button>
        </div>
      </Card>

      {/* Categorias */}
      <Link to="/categories" className="mb-4 block">
        <Card className="flex items-center justify-between transition-colors hover:bg-surface-2">
          <div className="flex items-center gap-3">
            <Tag size={18} className="text-muted" />
            <div>
              <p className="font-semibold">Categorias</p>
              <p className="text-sm text-muted">
                Crie e personalize com cor e ícone
              </p>
            </div>
          </div>
          <ChevronRight size={18} className="text-muted" />
        </Card>
      </Link>

      {/* Tags */}
      <Link to="/tags" className="mb-4 block">
        <Card className="flex items-center justify-between transition-colors hover:bg-surface-2">
          <div className="flex items-center gap-3">
            <Tags size={18} className="text-muted" />
            <div>
              <p className="font-semibold">Tags</p>
              <p className="text-sm text-muted">
                Renomeie, mescle e veja o gasto por marcador
              </p>
            </div>
          </div>
          <ChevronRight size={18} className="text-muted" />
        </Card>
      </Link>

      {/* Recorrências */}
      <Link to="/recurrences" className="mb-4 block">
        <Card className="flex items-center justify-between transition-colors hover:bg-surface-2">
          <div className="flex items-center gap-3">
            <Repeat size={18} className="text-muted" />
            <div>
              <p className="font-semibold">Recorrências</p>
              <p className="text-sm text-muted">
                Lançamentos automáticos (salário, assinaturas…)
              </p>
            </div>
          </div>
          <ChevronRight size={18} className="text-muted" />
        </Card>
      </Link>

      {/* Moeda */}
      <Card className="mb-4">
        <h2 className="mb-3 text-base font-semibold">Moeda padrão</h2>
        <Select
          value={settings.baseCurrency}
          onChange={(e) => setSetting("baseCurrency", e.target.value)}
        >
          {["BRL", "USD", "EUR", "GBP", "ARS"].map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </Select>
      </Card>

      {/* Backup */}
      <Card className="mb-4">
        <h2 className="mb-1 text-base font-semibold">Backup</h2>
        <p className="mb-3 text-sm text-muted">
          Seus dados ficam no aparelho. Exporte um backup completo (.json) para
          restaurar depois, ou um .csv para abrir em planilha.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={downloadBackup}>
            <Download size={16} /> Backup (.json)
          </Button>
          <Button variant="outline" onClick={downloadCsv}>
            <Download size={16} /> Planilha (.csv)
          </Button>
          <Button variant="outline" onClick={() => fileRef.current?.click()}>
            <Upload size={16} /> Importar backup
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json"
            className="hidden"
            onChange={handleImport}
          />
        </div>
      </Card>

      {/* Bloqueio do app */}
      <AppLockCard />

      {/* Sync */}
      <SyncCard />

      {/* Legal */}
      <div className="mt-4 flex justify-center gap-4 text-xs text-muted">
        <Link to="/privacidade" className="hover:text-text hover:underline">
          Política de Privacidade
        </Link>
        <span>·</span>
        <Link to="/termos" className="hover:text-text hover:underline">
          Termos de Uso
        </Link>
      </div>

      <ImportDialog open={importOpen} onOpenChange={setImportOpen} />
    </div>
  );
}
