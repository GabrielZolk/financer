import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Eye, EyeOff, ShieldCheck } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button, Input, Label } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";
import {
  usePrivacy,
  setupPin,
  unlock,
  lock,
  setMode,
  type PrivacyMode,
} from "@/lib/privacy";

type Step = null | "setup" | "choose" | "pin";

export function PrivacyControl() {
  const { t } = useTranslation();
  const { configured, unlocked, mode } = usePrivacy();
  const [step, setStep] = useState<Step>(null);
  const [chosen, setChosen] = useState<"partial" | "full">("full");
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

  function onPadlockClick() {
    if (!configured) setStep("setup");
    else if (unlocked) lock(); // trava na hora, mantém o mesmo PIN
    else setStep("choose");
  }

  async function handleSetup() {
    setError("");
    if (pin.length < 4) {
      setError(t("common.errPinMin"));
      return;
    }
    if (pin !== pin2) {
      setError(t("common.errPinMismatch"));
      return;
    }
    setBusy(true);
    try {
      await setupPin(pin);
      close();
    } finally {
      setBusy(false);
    }
  }

  async function handleUnlock() {
    setError("");
    setBusy(true);
    try {
      await unlock(pin, chosen);
      close();
    } catch {
      setError(t("common.errPinWrong"));
    } finally {
      setBusy(false);
    }
  }

  const Icon = unlocked && mode === "full" ? Eye : EyeOff;
  const color = !configured
    ? "text-muted"
    : unlocked
      ? mode === "full"
        ? "text-income"
        : "text-primary"
      : "text-muted";

  return (
    <>
      <button
        onClick={onPadlockClick}
        className={cn(
          "flex h-9 w-9 items-center justify-center rounded-xl bg-surface-2 transition-colors hover:bg-border",
          color,
        )}
        aria-label={t("priv.aria")}
        title={
          !configured
            ? t("priv.tipConfigure")
            : unlocked
              ? t("priv.tipUnlocked", {
                  mode:
                    mode === "full"
                      ? t("priv.modeAllVisible")
                      : t("priv.modePartial"),
                })
              : t("priv.tipLocked")
        }
      >
        <Icon size={18} />
      </button>

      {/* indicador de modo quando destravado em parcial (toggle rápido) */}
      {unlocked && (
        <button
          onClick={() => setMode(mode === "full" ? "partial" : "full")}
          className="ml-1 hidden rounded-lg bg-surface-2 px-2 py-1 text-[11px] font-semibold text-muted hover:text-text sm:block"
        >
          {mode === "full" ? t("priv.toggleAll") : t("priv.togglePartial")}
        </button>
      )}

      <Dialog open={step !== null} onOpenChange={(o) => !o && close()}>
        {step === "setup" && (
          <DialogContent title={t("priv.setupTitle")}>
            <div className="space-y-4">
              <div className="flex items-start gap-2 rounded-xl bg-surface-2 p-3 text-sm text-muted">
                <ShieldCheck size={18} className="mt-0.5 shrink-0 text-primary" />
                <span>{t("priv.setupWarn")}</span>
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
                  onKeyDown={(e) => e.key === "Enter" && handleSetup()}
                />
              </div>
              {error && <p className="text-sm text-expense">{error}</p>}
              <Button className="w-full" onClick={handleSetup} disabled={busy}>
                {busy ? t("priv.creating") : t("priv.activate")}
              </Button>
            </div>
          </DialogContent>
        )}

        {step === "choose" && (
          <DialogContent title={t("priv.unlockTitle")}>
            <div className="space-y-3">
              <p className="text-sm text-muted">{t("priv.howSee")}</p>
              <Choice
                title={t("priv.showAllTitle")}
                desc={t("priv.showAllDesc")}
                onClick={() => {
                  setChosen("full");
                  setStep("pin");
                }}
              />
              <Choice
                title={t("priv.partialTitle")}
                desc={t("priv.partialDesc")}
                onClick={() => {
                  setChosen("partial");
                  setStep("pin");
                }}
              />
            </div>
          </DialogContent>
        )}

        {step === "pin" && (
          <DialogContent title={t("priv.enterPinTitle")}>
            <div className="space-y-4">
              <p className="text-sm text-muted">
                {t("priv.modeLabel", {
                  mode:
                    chosen === "full"
                      ? t("priv.modeShowAll")
                      : t("priv.modePartial"),
                })}
              </p>
              <Input
                type="text"
                autoComplete="off"
                inputMode="numeric"
                className="pin-mask"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                placeholder={t("common.pin")}
                autoFocus
                onKeyDown={(e) => e.key === "Enter" && handleUnlock()}
              />
              {error && <p className="text-sm text-expense">{error}</p>}
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => {
                    setStep("choose");
                    setError("");
                  }}
                >
                  {t("common.back")}
                </Button>
                <Button className="flex-1" onClick={handleUnlock} disabled={busy}>
                  {busy ? "…" : t("priv.unlockBtn")}
                </Button>
              </div>
            </div>
          </DialogContent>
        )}
      </Dialog>
    </>
  );
}

function Choice({
  title,
  desc,
  onClick,
}: {
  title: string;
  desc: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full rounded-xl border border-border bg-surface-2 p-3 text-left transition-colors hover:border-primary"
    >
      <div className="text-sm font-bold">{title}</div>
      <div className="mt-0.5 text-xs text-muted">{desc}</div>
    </button>
  );
}

export type { PrivacyMode };
