import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Lock, ShieldCheck } from "lucide-react";
import { Button, Card, Input, Label } from "@/components/ui/primitives";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import {
  useAppLock,
  enableAppLock,
  disableAppLock,
  lockAppNow,
} from "@/lib/applock";

type Step = null | "enable" | "disable";

export function AppLockCard() {
  const { t } = useTranslation();
  const { enabled } = useAppLock();
  const [step, setStep] = useState<Step>(null);
  const [pin, setPin] = useState("");
  const [pin2, setPin2] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function close() {
    setStep(null);
    setPin("");
    setPin2("");
    setError("");
  }

  async function handleEnable() {
    setError("");
    if (pin.length < 4) return setError(t("common.errPinMin"));
    if (pin !== pin2) return setError(t("common.errPinMismatch"));
    setBusy(true);
    try {
      await enableAppLock(pin);
      close();
    } finally {
      setBusy(false);
    }
  }

  async function handleDisable() {
    setError("");
    setBusy(true);
    try {
      await disableAppLock(pin);
      close();
    } catch {
      setError(t("common.errPinWrong"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="mb-4">
      <div className="flex items-center gap-2">
        <Lock size={18} className="text-muted" />
        <h2 className="text-base font-semibold">{t("lock.title")}</h2>
      </div>
      {enabled ? (
        <>
          <p className="mb-3 mt-1 text-sm text-muted">{t("lock.enabledMsg")}</p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => lockAppNow()}>
              {t("lock.lockNow")}
            </Button>
            <Button variant="ghost" onClick={() => setStep("disable")}>
              {t("lock.disable")}
            </Button>
          </div>
        </>
      ) : (
        <>
          <p className="mb-3 mt-1 text-sm text-muted">{t("lock.desc")}</p>
          <Button onClick={() => setStep("enable")}>{t("lock.enable")}</Button>
        </>
      )}

      <Dialog open={step !== null} onOpenChange={(o) => !o && close()}>
        {step === "enable" && (
          <DialogContent title={t("lock.enableTitle")}>
            <div className="space-y-4">
              <div className="flex items-start gap-2 rounded-xl bg-surface-2 p-3 text-sm text-muted">
                <ShieldCheck size={18} className="mt-0.5 shrink-0 text-primary" />
                <span>{t("lock.enableWarn")}</span>
              </div>
              <div>
                <Label>{t("common.pin")}</Label>
                <Input
                  type="text"
                  autoComplete="off"
                  inputMode="numeric"
                  className="pin-mask"
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  placeholder={t("common.pinMin")}
                  autoFocus
                />
              </div>
              <div>
                <Label>{t("common.repeatPin")}</Label>
                <Input
                  type="text"
                  autoComplete="off"
                  inputMode="numeric"
                  className="pin-mask"
                  value={pin2}
                  onChange={(e) => setPin2(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleEnable()}
                />
              </div>
              {error && <p className="text-sm text-expense">{error}</p>}
              <Button className="w-full" onClick={handleEnable} disabled={busy}>
                {busy ? t("lock.enabling") : t("lock.enableBtn")}
              </Button>
            </div>
          </DialogContent>
        )}
        {step === "disable" && (
          <DialogContent title={t("lock.disableTitle")}>
            <div className="space-y-4">
              <Label>{t("lock.enterPinToDisable")}</Label>
              <Input
                type="text"
                autoComplete="off"
                inputMode="numeric"
                className="pin-mask"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                placeholder={t("common.pin")}
                autoFocus
                onKeyDown={(e) => e.key === "Enter" && handleDisable()}
              />
              {error && <p className="text-sm text-expense">{error}</p>}
              <Button className="w-full" onClick={handleDisable} disabled={busy}>
                {busy ? "…" : t("lock.disable")}
              </Button>
            </div>
          </DialogContent>
        )}
      </Dialog>
    </Card>
  );
}
