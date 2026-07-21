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
import { useTranslation } from "react-i18next";
import { Button, Card, Label, Select } from "@/components/ui/primitives";
import { PageHeader } from "@/components/PageHeader";
import { useSettings, setSetting, applyTheme } from "@/lib/settings";
import {
  downloadBackup,
  downloadCsv,
  downloadXlsx,
  importBackup,
  type BackupFile,
} from "@/lib/backup";
import { SyncCard } from "@/features/sync/SyncCard";
import { AppLockCard } from "@/features/applock/AppLockCard";
import { ImportDialog } from "@/features/import/ImportDialog";
import { CurrencyRatesCard } from "./CurrencyRatesCard";
import { LanguageCard } from "./LanguageCard";
import { ThemeCard } from "./ThemeCard";
import { DangerZoneCard } from "./DangerZoneCard";

const THEMES = [
  { value: "system", labelKey: "settings.themeSystem", icon: Monitor },
  { value: "light", labelKey: "settings.themeLight", icon: Sun },
  { value: "dark", labelKey: "settings.themeDark", icon: Moon },
] as const;

export function SettingsPage() {
  const settings = useSettings();
  const { t } = useTranslation();
  const fileRef = useRef<HTMLInputElement>(null);
  const [importOpen, setImportOpen] = useState(false);

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!window.confirm(t("settings.importConfirm"))) {
      e.target.value = "";
      return;
    }
    try {
      const json = JSON.parse(await file.text()) as BackupFile;
      await importBackup(json);
      alert(t("settings.importOk"));
    } catch (err) {
      alert(t("settings.importFail") + " " + (err as Error).message);
    }
    e.target.value = "";
  }

  return (
    <div>
      <PageHeader title={t("settings.title")} />

      {/* Aparência */}
      <Card className="mb-4">
        <h2 className="mb-3 text-base font-semibold">
          {t("settings.appearance")}
        </h2>
        <Label>{t("settings.mode")}</Label>
        <div className="grid grid-cols-3 gap-2">
          {THEMES.map((th) => (
            <button
              key={th.value}
              onClick={() => {
                setSetting("theme", th.value);
                applyTheme(th.value);
              }}
              className={`flex flex-col items-center gap-1 rounded-xl border py-3 text-sm transition-colors ${
                settings.theme === th.value
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted hover:bg-surface-2"
              }`}
            >
              <th.icon size={18} />
              {t(th.labelKey)}
            </button>
          ))}
        </div>
      </Card>

      {/* Tema (paleta de cores) */}
      <ThemeCard />

      {/* Idioma */}
      <LanguageCard />

      {/* Importar extrato */}
      <Card className="mb-4">
        <div className="flex items-center gap-3">
          <FileSpreadsheet size={18} className="text-muted" />
          <div className="flex-1">
            <p className="font-semibold">{t("settings.importStatement")}</p>
            <p className="text-sm text-muted">
              {t("settings.importStatementDesc")}
            </p>
          </div>
          <Button variant="outline" onClick={() => setImportOpen(true)}>
            {t("settings.importStatement")}
          </Button>
        </div>
      </Card>

      {/* Categorias */}
      <Link to="/categories" className="mb-4 block">
        <Card className="flex items-center justify-between transition-colors hover:bg-surface-2">
          <div className="flex items-center gap-3">
            <Tag size={18} className="text-muted" />
            <div>
              <p className="font-semibold">{t("settings.categories")}</p>
              <p className="text-sm text-muted">
                {t("settings.categoriesDesc")}
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
              <p className="font-semibold">{t("settings.tags")}</p>
              <p className="text-sm text-muted">{t("settings.tagsDesc")}</p>
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
              <p className="font-semibold">{t("settings.recurrences")}</p>
              <p className="text-sm text-muted">
                {t("settings.recurrencesDesc")}
              </p>
            </div>
          </div>
          <ChevronRight size={18} className="text-muted" />
        </Card>
      </Link>

      {/* Moeda */}
      <Card className="mb-4">
        <h2 className="mb-3 text-base font-semibold">
          {t("settings.baseCurrency")}
        </h2>
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

      {/* Câmbio (multi-moeda) — depois de escolher a moeda padrão */}
      <CurrencyRatesCard />

      {/* Backup */}
      <Card className="mb-4">
        <h2 className="mb-1 text-base font-semibold">{t("settings.backup")}</h2>
        <p className="mb-3 text-sm text-muted">{t("settings.backupDesc")}</p>
        <p className="mb-1.5 mt-1 text-xs font-semibold uppercase tracking-wide text-muted">
          {t("settings.exportData")}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => void downloadXlsx()}>
            <FileSpreadsheet size={16} /> {t("settings.backupExcel")}
          </Button>
          <Button variant="outline" onClick={downloadCsv}>
            <Download size={16} /> {t("settings.backupCsv")}
          </Button>
        </div>

        <p className="mb-1.5 mt-4 text-xs font-semibold uppercase tracking-wide text-muted">
          {t("settings.backupSection")}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={downloadBackup}>
            <Download size={16} /> {t("settings.backupJson")}
          </Button>
          <Button variant="outline" onClick={() => fileRef.current?.click()}>
            <Upload size={16} /> {t("settings.backupImport")}
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

      {/* Zona de perigo */}
      <div className="mt-4">
        <DangerZoneCard />
      </div>

      {/* Legal */}
      <div className="mt-4 flex justify-center gap-4 text-xs text-muted">
        <Link to="/privacidade" className="hover:text-text hover:underline">
          {t("settings.privacyPolicy")}
        </Link>
        <span>·</span>
        <Link to="/termos" className="hover:text-text hover:underline">
          {t("settings.terms")}
        </Link>
      </div>

      <ImportDialog open={importOpen} onOpenChange={setImportOpen} />
    </div>
  );
}
