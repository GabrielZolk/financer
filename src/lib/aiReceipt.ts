import { supabase } from "@/lib/supabase";
import { AiError, type ParsedTx, type AiContext } from "@/lib/ai";

/** Reduz a imagem (máx 1280px, JPEG) pra caber no payload da IA. */
async function toCompactDataUrl(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const max = 1280;
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new AiError("ai_error");
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close?.();
  return canvas.toDataURL("image/jpeg", 0.7);
}

/** Lê uma foto de cupom e devolve os campos do lançamento (Grok vision). */
export async function parseReceipt(
  file: File,
  ctx: AiContext,
): Promise<ParsedTx> {
  if (!supabase) throw new AiError("ai_needs_login");
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new AiError("ai_needs_login");

  const image = await toCompactDataUrl(file);

  let res: Response;
  try {
    res = await fetch("/api/receipt", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        image,
        today: ctx.today,
        currency: ctx.currency,
        accounts: ctx.accounts,
        categories: ctx.categories,
      }),
    });
  } catch {
    throw new AiError("ai_unreachable");
  }
  if (!res.ok) {
    let code = "ai_error";
    try {
      const b = (await res.json()) as { error?: string };
      if (b?.error) code = b.error;
    } catch {
      /* ignore */
    }
    throw new AiError(code);
  }
  return (await res.json()) as ParsedTx;
}
