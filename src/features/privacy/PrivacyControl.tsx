import { useState } from "react";
import { Lock, LockOpen, ShieldCheck } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button, Input, Label } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";
import {
  usePrivacy,
  setupPin,
  unlock,
  relockWithPin,
  setMode,
  type PrivacyMode,
} from "@/lib/privacy";

type Step = null | "setup" | "lock" | "choose" | "pin";

export function PrivacyControl() {
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
    else if (unlocked) setStep("lock"); // definir/renovar o PIN ao travar
    else setStep("choose");
  }

  async function handleLock() {
    setError("");
    if (pin.length < 4) {
      setError("Use um PIN de pelo menos 4 dígitos.");
      return;
    }
    if (pin !== pin2) {
      setError("Os PINs não conferem.");
      return;
    }
    setBusy(true);
    try {
      await relockWithPin(pin);
      close();
    } finally {
      setBusy(false);
    }
  }

  async function handleSetup() {
    setError("");
    if (pin.length < 4) {
      setError("Use um PIN de pelo menos 4 dígitos.");
      return;
    }
    if (pin !== pin2) {
      setError("Os PINs não conferem.");
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
      setError("PIN incorreto.");
    } finally {
      setBusy(false);
    }
  }

  const Icon = unlocked && mode === "full" ? LockOpen : Lock;
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
        aria-label="Privacidade"
        title={
          !configured
            ? "Configurar privacidade"
            : unlocked
              ? `Privado: ${mode === "full" ? "tudo visível" : "parcial"} — clique para travar`
              : "Privado travado — clique para destravar"
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
          {mode === "full" ? "tudo" : "parcial"}
        </button>
      )}

      <Dialog open={step !== null} onOpenChange={(o) => !o && close()}>
        {step === "setup" && (
          <DialogContent title="Proteger gastos privados">
            <div className="space-y-4">
              <div className="flex items-start gap-2 rounded-xl bg-surface-2 p-3 text-sm text-muted">
                <ShieldCheck size={18} className="mt-0.5 shrink-0 text-primary" />
                <span>
                  Crie um PIN. Os lançamentos marcados como privados serão{" "}
                  <b className="text-text">criptografados</b> — ninguém vê sem
                  ele, nem aqui nem na nuvem.{" "}
                  <b className="text-expense">
                    Se esquecer o PIN, esses dados não podem ser recuperados.
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
                  onKeyDown={(e) => e.key === "Enter" && handleSetup()}
                />
              </div>
              {error && <p className="text-sm text-expense">{error}</p>}
              <Button className="w-full" onClick={handleSetup} disabled={busy}>
                {busy ? "Criando…" : "Ativar privacidade"}
              </Button>
            </div>
          </DialogContent>
        )}

        {step === "lock" && (
          <DialogContent title="Travar privados">
            <div className="space-y-4">
              <p className="text-sm text-muted">
                Defina o PIN para esconder os privados. Pode ser um novo a cada
                vez — o último definido é o que vai destravar.
              </p>
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
                  onKeyDown={(e) => e.key === "Enter" && handleLock()}
                />
              </div>
              {error && <p className="text-sm text-expense">{error}</p>}
              <Button className="w-full" onClick={handleLock} disabled={busy}>
                {busy ? "Travando…" : "Travar agora"}
              </Button>
            </div>
          </DialogContent>
        )}

        {step === "choose" && (
          <DialogContent title="Destravar privados">
            <div className="space-y-3">
              <p className="text-sm text-muted">Como você quer ver agora?</p>
              <Choice
                title="👁️ Mostrar tudo"
                desc="Exibe os lançamentos privados e soma no total."
                onClick={() => {
                  setChosen("full");
                  setStep("pin");
                }}
              />
              <Choice
                title="➗ Parcial (só somar)"
                desc="Mantém escondidos, mas inclui os valores no total — pro número ficar certo sem expor o quê."
                onClick={() => {
                  setChosen("partial");
                  setStep("pin");
                }}
              />
            </div>
          </DialogContent>
        )}

        {step === "pin" && (
          <DialogContent title="Digite seu PIN">
            <div className="space-y-4">
              <p className="text-sm text-muted">
                Modo: <b className="text-text">{chosen === "full" ? "mostrar tudo" : "parcial"}</b>
              </p>
              <Input
                type="text"
                autoComplete="off"
                inputMode="numeric"
                className="pin-mask"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                placeholder="PIN"
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
                  Voltar
                </Button>
                <Button className="flex-1" onClick={handleUnlock} disabled={busy}>
                  {busy ? "…" : "Destravar"}
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
