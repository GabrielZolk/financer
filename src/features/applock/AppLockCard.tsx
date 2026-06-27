import { useState } from "react";
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
    if (pin.length < 4) return setError("Use um PIN de pelo menos 4 dígitos.");
    if (pin !== pin2) return setError("Os PINs não conferem.");
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
      setError("PIN incorreto.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="mb-4">
      <div className="flex items-center gap-2">
        <Lock size={18} className="text-muted" />
        <h2 className="text-base font-semibold">Bloqueio do app</h2>
      </div>
      {enabled ? (
        <>
          <p className="mb-3 mt-1 text-sm text-muted">
            Ativado — pede o PIN toda vez que o app abre.
          </p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => lockAppNow()}>
              Bloquear agora
            </Button>
            <Button variant="ghost" onClick={() => setStep("disable")}>
              Desativar
            </Button>
          </div>
        </>
      ) : (
        <>
          <p className="mb-3 mt-1 text-sm text-muted">
            Exige um PIN para abrir o app inteiro. (PIN próprio, separado da
            privacidade.)
          </p>
          <Button onClick={() => setStep("enable")}>Ativar</Button>
        </>
      )}

      <Dialog open={step !== null} onOpenChange={(o) => !o && close()}>
        {step === "enable" && (
          <DialogContent title="Ativar bloqueio do app">
            <div className="space-y-4">
              <div className="flex items-start gap-2 rounded-xl bg-surface-2 p-3 text-sm text-muted">
                <ShieldCheck size={18} className="mt-0.5 shrink-0 text-primary" />
                <span>
                  O app vai pedir este PIN ao abrir.{" "}
                  <b className="text-expense">
                    Se esquecer, terá que limpar os dados do app para entrar.
                  </b>
                </span>
              </div>
              <div>
                <Label>PIN</Label>
                <Input
                  type="text"
                  autoComplete="off"
                  inputMode="numeric"
                  className="pin-mask"
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  placeholder="mín. 4 dígitos"
                  autoFocus
                />
              </div>
              <div>
                <Label>Repita o PIN</Label>
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
                {busy ? "Ativando…" : "Ativar bloqueio"}
              </Button>
            </div>
          </DialogContent>
        )}
        {step === "disable" && (
          <DialogContent title="Desativar bloqueio">
            <div className="space-y-4">
              <Label>Digite o PIN para desativar</Label>
              <Input
                type="text"
                autoComplete="off"
                inputMode="numeric"
                className="pin-mask"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                placeholder="PIN"
                autoFocus
                onKeyDown={(e) => e.key === "Enter" && handleDisable()}
              />
              {error && <p className="text-sm text-expense">{error}</p>}
              <Button className="w-full" onClick={handleDisable} disabled={busy}>
                {busy ? "…" : "Desativar"}
              </Button>
            </div>
          </DialogContent>
        )}
      </Dialog>
    </Card>
  );
}
