import {
  Home,
  Utensils,
  Car,
  HeartPulse,
  Gamepad2,
  GraduationCap,
  ShoppingBag,
  Repeat,
  FileText,
  MoreHorizontal,
  Briefcase,
  Laptop,
  TrendingUp,
  Gift,
  Tag,
  type LucideIcon,
} from "lucide-react";

/** Mapa nome→ícone usado pelas categorias (campo `icon` da categoria). */
export const CATEGORY_ICONS: Record<string, LucideIcon> = {
  home: Home,
  utensils: Utensils,
  car: Car,
  "heart-pulse": HeartPulse,
  "gamepad-2": Gamepad2,
  "graduation-cap": GraduationCap,
  "shopping-bag": ShoppingBag,
  repeat: Repeat,
  "file-text": FileText,
  ellipsis: MoreHorizontal,
  briefcase: Briefcase,
  laptop: Laptop,
  "trending-up": TrendingUp,
  gift: Gift,
};

/** Lista de ícones disponíveis para o seletor de categoria (futuro). */
export const ICON_NAMES = Object.keys(CATEGORY_ICONS);

export function iconFor(name?: string | null): LucideIcon {
  return (name && CATEGORY_ICONS[name]) || Tag;
}
