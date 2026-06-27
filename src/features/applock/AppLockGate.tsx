import { useState, type ReactNode } from "react";
import { Lock } from "lucide-react";
import { Button, Input } from "@/components/ui/primitives";
import { useAppLock, unlockApp } from "@/lib/applock";

/** Envolve o app: se o bloqueio estiver ligado e travado, exige o PIN. */
export function AppLockGate({ children }: { children: ReactNode }) {
  const { enabled, unlocked } = useAppLock();
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (!enabled || unlocked) return <>{children}</>;

  async function submit() {
    setError("");
    if (!pin) return;
    setBusy(true);
    try {
      await unlockApp(pin);
      setPin("");
    } catch {
      setError("PIN incorreto.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-bg px-6 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-violet-600 text-white">
        <Lock size={28} />
      </div>
      <div>
        <h1 className="text-xl font-bold">Financer bloqueado</h1>
        <p className="mt-1 text-sm text-muted">Digite o PIN para entrar</p>
      </div>
      <div className="w-full max-w-[260px]">
        <Input
          type="text"
          inputMode="numeric"
          autoFocus
          className="pin-mask text-center text-lg tracking-widest"
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="••••"
        />
        {error && <p className="mt-2 text-sm text-expense">{error}</p>}
        <Button className="mt-3 w-full" onClick={submit} disabled={busy}>
          {busy ? "…" : "Desbloquear"}
        </Button>
      </div>
    </div>
  );
}
