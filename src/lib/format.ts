/**
 * Formatação locale-aware de datas. Usa o locale ativo (definido pela i18n)
 * por padrão, então a maioria dos chamadores não precisa passar nada.
 */
import { getActiveLocale } from "@/lib/i18n/config";

/** Converte "YYYY-MM-DD" ou ISO/ Date num objeto Date (meia-noite local p/ datas curtas). */
function toDate(date: string | Date): Date {
  if (date instanceof Date) return date;
  // "YYYY-MM-DD" → meia-noite LOCAL (evita pular um dia por fuso)
  return new Date(date.length <= 10 ? date + "T00:00:00" : date);
}

/** Data curta: 27/06/2026 (pt), 06/27/2026 (en), 27/6/2026 (es). */
export function formatDate(
  date: string | Date,
  opts: Intl.DateTimeFormatOptions = {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  },
  locale: string = getActiveLocale(),
): string {
  return toDate(date).toLocaleDateString(locale, opts);
}

/** Dia + mês curto: "27 jun" / "Jun 27". */
export function formatDayMonth(
  date: string | Date,
  locale: string = getActiveLocale(),
): string {
  return toDate(date).toLocaleDateString(locale, {
    day: "2-digit",
    month: "short",
  });
}

/** Mês curto a partir de "YYYY-MM": "jun" / "Jun". */
export function monthShort(
  month: string,
  locale: string = getActiveLocale(),
): string {
  return new Date(month + "-01T00:00:00").toLocaleDateString(locale, {
    month: "short",
  });
}

/** Mês por extenso + ano: "junho de 2026" / "June 2026". */
export function monthLong(
  monthOrDate: string | Date,
  locale: string = getActiveLocale(),
): string {
  const d =
    typeof monthOrDate === "string"
      ? new Date(
          (monthOrDate.length === 7 ? monthOrDate + "-01" : monthOrDate) +
            "T00:00:00",
        )
      : monthOrDate;
  return d.toLocaleDateString(locale, { month: "long", year: "numeric" });
}
