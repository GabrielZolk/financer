import { useState } from "react";
import { MessageSquarePlus } from "lucide-react";
import { Button, Textarea } from "@/components/ui/primitives";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { supabase } from "@/lib/supabase";
import { getCurrentUserId } from "@/db/repo";
import { uid, nowIso } from "@/lib/utils";
import { celebrate } from "@/components/feedback/Feito";

const FEEDBACK_EMAIL = "gabriel.zolk@znap.com.br";
const LAST_KEY = "fin.lastFeedback"; // device-local
const COOLDOWN_DAYS = 30;

/** Há quantos dias foi o último feedback (Infinity se nunca). */
function daysSinceLast(): number {
  try {
    const raw = localStorage.getItem(LAST_KEY);
    if (!raw) return Infinity;
    return (Date.now() - Date.parse(raw)) / 86_400_000;
  } catch {
    return Infinity;
  }
}

export function FeedbackButton() {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);

  const since = daysSinceLast();
  const limited = since < COOLDOWN_DAYS;
  const daysLeft = Math.ceil(COOLDOWN_DAYS - since);

  async function send() {
    const msg = text.trim();
    if (!msg) return;
    setSending(true);

    const userId = getCurrentUserId();
    let savedCloud = false;
    if (supabase && userId !== "local") {
      try {
        const { error } = await supabase.from("records").upsert({
          id: uid(),
          user_id: userId,
          table_name: "feedback",
          data: {
            text: msg,
            createdAt: nowIso(),
            page: location.hash,
            ua: navigator.userAgent,
          },
          updated_at: nowIso(),
          deleted: false,
        });
        savedCloud = !error;
      } catch {
        /* cai no fallback */
      }
    }
    setSending(false);

    try {
      localStorage.setItem(LAST_KEY, nowIso());
    } catch {
      /* ignora */
    }

    if (savedCloud) {
      setText("");
      setOpen(false);
      celebrate("check", "Feedback enviado! Obrigado 🙏");
    } else {
      const subject = encodeURIComponent("Feedback — Financer");
      const body = encodeURIComponent(msg);
      window.location.href = `mailto:${FEEDBACK_EMAIL}?subject=${subject}&body=${body}`;
      setOpen(false);
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="Enviar feedback"
        aria-label="Enviar feedback"
        className="flex h-9 items-center gap-1.5 rounded-xl bg-surface-2 px-2.5 text-xs font-medium text-muted transition-colors hover:bg-border hover:text-text"
      >
        <MessageSquarePlus size={16} />
        <span className="hidden sm:inline">Feedback</span>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title="Enviar feedback" className="max-w-sm">
          {limited ? (
            <div className="space-y-3">
              <p className="text-sm text-muted">
                Você já enviou um feedback recentemente — valeu! 🙏 Pode mandar
                outro em <b className="text-text">{daysLeft} dia(s)</b>.
              </p>
              <p className="text-xs text-muted">
                (Limite de 1 por mês pra evitar spam. Bug urgente? Fale direto:{" "}
                {FEEDBACK_EMAIL})
              </p>
              <div className="flex justify-end">
                <Button variant="outline" onClick={() => setOpen(false)}>
                  Fechar
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-muted">
                Achou um bug ou tem uma ideia? Conta aqui (1 por mês).
              </p>
              <Textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Sua mensagem…"
                autoFocus
              />
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setOpen(false)}>
                  Cancelar
                </Button>
                <Button onClick={send} disabled={sending || !text.trim()}>
                  {sending ? "Enviando…" : "Enviar"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
