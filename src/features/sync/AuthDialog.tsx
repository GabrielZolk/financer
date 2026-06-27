import { useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button, Input, Label } from "@/components/ui/primitives";
import { signIn, signUp, signInWithGoogle } from "@/lib/sync";

export function AuthDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  async function google() {
    setError("");
    setBusy(true);
    try {
      await signInWithGoogle(); // redireciona pra o Google
    } catch (err) {
      setError(translateError((err as Error).message));
      setBusy(false);
    }
  }

  async function submit() {
    setError("");
    setInfo("");
    if (!email.trim() || password.length < 6) {
      setError("Informe e-mail e senha (mín. 6 caracteres).");
      return;
    }
    setBusy(true);
    try {
      if (mode === "in") {
        await signIn(email.trim(), password);
        onOpenChange(false);
      } else {
        await signUp(email.trim(), password);
        setInfo("Conta criada! Já pode entrar com seu e-mail e senha.");
        setMode("in");
      }
    } catch (err) {
      setError(translateError((err as Error).message));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={mode === "in" ? "Entrar" : "Criar conta"}>
        <div className="space-y-4">
          <p className="text-sm text-muted">
            Entre para sincronizar seus dados entre dispositivos. Tudo continua
            funcionando offline.
          </p>
          {mode === "up" && (
            <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-2.5 py-2 text-xs text-amber-300">
              ⚠️ Use um <b>e-mail verdadeiro</b>. É com ele que você entra em
              outros aparelhos e recupera a senha. Se errar o e-mail, pode
              perder o acesso à conta na nuvem (os dados no aparelho continuam
              salvos).
            </p>
          )}
          <Button
            variant="outline"
            className="w-full"
            onClick={google}
            disabled={busy}
          >
            <span className="mr-2 grid h-5 w-5 place-items-center rounded-full bg-white text-[13px] font-bold text-[#4285F4]">
              G
            </span>
            Continuar com Google
          </Button>

          <div className="flex items-center gap-3 text-xs text-muted">
            <span className="h-px flex-1 bg-border" /> ou{" "}
            <span className="h-px flex-1 bg-border" />
          </div>

          <div>
            <Label>E-mail</Label>
            <Input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="voce@email.com"
            />
          </div>
          <div>
            <Label>Senha</Label>
            <Input
              type="password"
              autoComplete={mode === "in" ? "current-password" : "new-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••"
              onKeyDown={(e) => e.key === "Enter" && submit()}
            />
          </div>

          {error && <p className="text-sm text-expense">{error}</p>}
          {info && <p className="text-sm text-income">{info}</p>}

          <Button className="w-full" onClick={submit} disabled={busy}>
            {busy ? "Aguarde…" : mode === "in" ? "Entrar" : "Criar conta"}
          </Button>

          <button
            className="w-full text-center text-sm text-muted hover:text-text"
            onClick={() => {
              setMode(mode === "in" ? "up" : "in");
              setError("");
              setInfo("");
            }}
          >
            {mode === "in"
              ? "Não tem conta? Criar uma"
              : "Já tem conta? Entrar"}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function translateError(msg: string): string {
  if (/invalid login/i.test(msg)) return "E-mail ou senha incorretos.";
  if (/already registered/i.test(msg)) return "Este e-mail já tem conta.";
  if (/email not confirmed/i.test(msg))
    return "Confirme seu e-mail antes de entrar.";
  return msg;
}
