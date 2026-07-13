import { useState } from "react";
import { useTranslation } from "react-i18next";
import { MessageSquarePlus } from "lucide-react";
import { Button, Textarea } from "@/components/ui/primitives";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { supabase } from "@/lib/supabase";
import { getCurrentUserId } from "@/db/repo";
import { uid, nowIso } from "@/lib/utils";
import { celebrate } from "@/components/feedback/Feito";

const FEEDBACK_EMAIL = "zolkapp.dev@gmail.com";
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
  const { t } = useTranslation();
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
      celebrate("check", t("fb.sent"));
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
        title={t("fb.title")}
        aria-label={t("fb.title")}
        className="flex h-9 items-center gap-1.5 rounded-xl bg-surface-2 px-2.5 text-xs font-medium text-muted transition-colors hover:bg-border hover:text-text"
      >
        <MessageSquarePlus size={16} />
        <span className="hidden sm:inline">{t("fb.label")}</span>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title={t("fb.title")} className="max-w-sm">
          {limited ? (
            <div className="space-y-3">
              <p className="text-sm text-muted">
                {t("fb.limitedMsg", { count: daysLeft })}
              </p>
              <p className="text-xs text-muted">
                {t("fb.limitedNote", { email: FEEDBACK_EMAIL })}
              </p>
              <div className="flex justify-end">
                <Button variant="outline" onClick={() => setOpen(false)}>
                  {t("common.close")}
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-muted">{t("fb.prompt")}</p>
              <Textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={t("fb.placeholder")}
                autoFocus
              />
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setOpen(false)}>
                  {t("common.cancel")}
                </Button>
                <Button onClick={send} disabled={sending || !text.trim()}>
                  {sending ? t("fb.sending") : t("fb.send")}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
