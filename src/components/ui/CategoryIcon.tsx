import { cn } from "@/lib/utils";
import { iconFor } from "@/lib/icons";

/** Badge "tint suave": círculo com fundo da cor da categoria + ícone colorido. */
export function CategoryIcon({
  icon,
  color = "#94a3b8",
  size = 40,
  className,
}: {
  icon?: string | null;
  color?: string;
  size?: number;
  className?: string;
}) {
  const Icon = iconFor(icon);
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full",
        className,
      )}
      style={{ width: size, height: size, backgroundColor: `${color}22`, color }}
    >
      <Icon size={Math.round(size * 0.5)} />
    </span>
  );
}
