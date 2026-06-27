import { useState } from "react";
import { Cloud, RefreshCw, LogOut } from "lucide-react";
import { Button, Card } from "@/components/ui/primitives";
import { isSupabaseConfigured } from "@/lib/supabase";
import { useSyncState, fullSync, signOut } from "@/lib/sync";
import { getCurrentUserId } from "@/db/repo";
import { AuthDialog } from "./AuthDialog";

export function SyncCard() {
  const sync = useSyncState();
  const [authOpen, setAuthOpen] = useState(false);

  return (
    <Card>
      <div className="flex items-center gap-2">
        <Cloud size={18} className="text-muted" />
        <h2 className="text-base font-semibold">Sincronização na nuvem</h2>
      </div>

      {!isSupabaseConfigured ? (
        <p className="mt-1 text-sm text-muted">
          Sync ainda não configurado. Defina <code>VITE_SUPABASE_URL</code> e{" "}
          <code>VITE_SUPABASE_ANON_KEY</code> em <code>.env.local</code> e
          reinicie o app. Por enquanto, use Exportar/Importar.
        </p>
      ) : sync.status === "signed_out" ? (
        <>
          <p className="mb-3 mt-1 text-sm text-muted">
            Entre para manter os mesmos dados no celular e no PC.
          </p>
          <Button onClick={() => setAuthOpen(true)}>Entrar / Criar conta</Button>
        </>
      ) : (
        <>
          <div className="mb-3 mt-1 space-y-0.5 text-sm">
            <p className="text-muted">
              Conta: <span className="text-text">{sync.email}</span>
            </p>
            <p className="text-muted">
              Status:{" "}
              <span className="text-text">{statusLabel(sync.status)}</span>
              {sync.pending > 0 && ` · ${sync.pending} pendente(s)`}
            </p>
            {sync.lastSyncAt && (
              <p className="text-muted">
                Último sync:{" "}
                {new Date(sync.lastSyncAt).toLocaleString("pt-BR")}
              </p>
            )}
            {sync.error && <p className="text-expense">{sync.error}</p>}
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => {
                const uid = getCurrentUserId();
                if (uid !== "local") void fullSync(uid);
              }}
              disabled={sync.status === "syncing"}
            >
              <RefreshCw
                size={16}
                className={sync.status === "syncing" ? "animate-spin" : ""}
              />
              Sincronizar agora
            </Button>
            <Button variant="ghost" onClick={() => void signOut()}>
              <LogOut size={16} /> Sair
            </Button>
          </div>
        </>
      )}

      <AuthDialog open={authOpen} onOpenChange={setAuthOpen} />
    </Card>
  );
}

function statusLabel(s: string): string {
  return (
    {
      idle: "Sincronizado",
      syncing: "Sincronizando…",
      offline: "Offline",
      error: "Erro",
    }[s] ?? s
  );
}
