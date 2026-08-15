import { useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, Trash2 } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button, Input } from "@/components/ui/primitives";
import { useSyncState } from "@/lib/sync";
import { eraseAllData, DeleteAccountUnavailable } from "@/lib/wipe";

export function DangerZoneCard() {
  const { t } = useTranslation();
  const sync = useSyncState();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [erasing, setErasing] = useState(false);
  const [alsoAccount, setAlsoAccount] = useState(false);
  const [error, setError] = useState("");

  const signedIn = sync.status === "idle" || sync.status === "syncing";
  const word = t("danger.word");
  const canErase = typed.trim().toUpperCase() === word.toUpperCase();

  async function handleErase() {
    if (!canErase || erasing) return;
    setErasing(true);
    setError("");
    try {
      await eraseAllData({ deleteAccount: signedIn && alsoAccount });
      // eraseAllData recarrega a página; se não recarregar (erro), reabilita
    } catch (e) {
      setError(
        e instanceof DeleteAccountUnavailable
          ? t("danger.accountError")
          : t("common.error"),
      );
      setErasing(false);
    }
  }

  return (
    <div className="mb-4 rounded-2xl border border-expense/40 bg-expense/5 p-4">
      <div className="flex items-center gap-2">
        <AlertTriangle size={18} className="text-expense" />
        <h2 className="text-base font-semibold text-expense">
          {t("danger.title")}
        </h2>
      </div>
      <p className="mb-3 mt-1 text-sm text-muted">{t("danger.desc")}</p>
      <Button variant="danger" onClick={() => setOpen(true)}>
        <Trash2 size={16} /> {t("danger.eraseBtn")}
      </Button>

      <Dialog
        open={open}
        onOpenChange={(o) => {
          if (!o) setTyped("");
          setOpen(o);
        }}
      >
        <DialogContent title={t("danger.dialogTitle")}>
          <div className="space-y-4">
            <p className="text-sm text-muted">
              {signedIn ? t("danger.warnCloud") : t("danger.warnLocal")}
            </p>
            <p className="rounded-xl border border-border bg-surface-2 p-3 text-sm text-muted">
              {t("danger.backupHint")}
            </p>

            {signedIn && (
              <label className="flex cursor-pointer items-start gap-2 rounded-xl border border-border p-3">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={alsoAccount}
                  onChange={(e) => setAlsoAccount(e.target.checked)}
                />
                <span className="text-sm">
                  <span className="font-medium">{t("danger.alsoAccount")}</span>
                  <span className="block text-xs text-muted">
                    {t("danger.alsoAccountHint")}
                  </span>
                </span>
              </label>
            )}

            {error && (
              <p className="rounded-xl border border-expense/40 bg-expense/5 p-3 text-sm text-expense">
                {error}
              </p>
            )}

            <div>
              <label className="mb-1 block text-sm font-medium">
                {t("danger.confirmPrompt", { word })}
              </label>
              <Input
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                placeholder={word}
                autoFocus
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setOpen(false)}>
                {t("common.cancel")}
              </Button>
              <Button
                variant="danger"
                onClick={handleErase}
                disabled={!canErase || erasing}
              >
                <Trash2 size={16} />
                {erasing ? t("danger.erasing") : t("danger.confirmBtn")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
