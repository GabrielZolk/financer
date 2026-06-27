import * as React from "react";
import { cn } from "@/lib/utils";

/* ---------------------------------- Button --------------------------------- */
type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "outline";
type ButtonSize = "sm" | "md" | "lg" | "icon";

const buttonVariants: Record<ButtonVariant, string> = {
  primary: "bg-primary text-primary-fg hover:opacity-90",
  secondary: "bg-surface-2 text-text hover:bg-border",
  ghost: "bg-transparent text-text hover:bg-surface-2",
  danger: "bg-expense text-white hover:opacity-90",
  outline: "border border-border bg-transparent text-text hover:bg-surface-2",
};
const buttonSizes: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-sm",
  md: "h-10 px-4 text-sm",
  lg: "h-12 px-6 text-base",
  icon: "h-10 w-10",
};

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", ...props }, ref) => (
    <button
      ref={ref}
      className={cn(
        "inline-flex select-none items-center justify-center gap-2 rounded-xl font-medium transition-colors disabled:pointer-events-none disabled:opacity-50",
        buttonVariants[variant],
        buttonSizes[size],
        className,
      )}
      {...props}
    />
  ),
);
Button.displayName = "Button";

/* ----------------------------------- Card ---------------------------------- */
export function Card({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-border bg-surface p-4 shadow-sm",
        className,
      )}
      {...props}
    />
  );
}

/* ---------------------------------- Input ---------------------------------- */
export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, ...props }, ref) => (
  <input
    ref={ref}
    className={cn(
      "h-10 w-full rounded-xl border border-border bg-surface px-3 text-sm outline-none placeholder:text-muted focus:border-primary focus:ring-2 focus:ring-primary/20",
      className,
    )}
    {...props}
  />
));
Input.displayName = "Input";

/* -------------------------------- Textarea --------------------------------- */
export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      "min-h-[80px] w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none placeholder:text-muted focus:border-primary focus:ring-2 focus:ring-primary/20",
      className,
    )}
    {...props}
  />
));
Textarea.displayName = "Textarea";

/* ----------------------------------- Label --------------------------------- */
export function Label({
  className,
  ...props
}: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={cn("mb-1 block text-sm font-medium text-muted", className)}
      {...props}
    />
  );
}

/* ---------------------------------- Select --------------------------------- */
export const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(({ className, children, ...props }, ref) => (
  <select
    ref={ref}
    className={cn(
      "h-10 w-full rounded-xl border border-border bg-surface px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20",
      className,
    )}
    {...props}
  >
    {children}
  </select>
));
Select.displayName = "Select";

/* ---------------------------------- Badge ---------------------------------- */
export function Badge({
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        className,
      )}
      {...props}
    />
  );
}

/* -------------------------------- SectionTitle ----------------------------- */
export function SectionTitle({
  children,
  action,
}: {
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <h2 className="text-base font-semibold">{children}</h2>
      {action}
    </div>
  );
}

/* --------------------------------- EmptyState ------------------------------ */
/** Ilustração padrão: carteira com moedas (cores adaptam ao tema). */
export function WalletIllustration() {
  return (
    <svg width="150" height="118" viewBox="0 0 150 118" fill="none" aria-hidden>
      {/* moedas flutuando */}
      <circle cx="58" cy="30" r="13" fill="#f59e0b" />
      <circle cx="58" cy="30" r="13" fill="none" stroke="#d97706" strokeWidth="2" />
      <text
        x="58"
        y="35"
        fontSize="13"
        fontWeight="800"
        fill="#b45309"
        textAnchor="middle"
        fontFamily="Inter, sans-serif"
      >
        $
      </text>
      <circle cx="89" cy="22" r="8.5" fill="#fbbf24" />
      <text
        x="89"
        y="26"
        fontSize="9"
        fontWeight="800"
        fill="#b45309"
        textAnchor="middle"
        fontFamily="Inter, sans-serif"
      >
        $
      </text>
      {/* carteira */}
      <rect
        x="33"
        y="48"
        width="84"
        height="56"
        rx="11"
        style={{ fill: "var(--surface-2)", stroke: "var(--border)" }}
        strokeWidth="2"
      />
      <path d="M33 64 H117" style={{ stroke: "var(--border)" }} strokeWidth="2" />
      <rect
        x="92"
        y="70"
        width="30"
        height="16"
        rx="8"
        style={{ fill: "var(--bg)", stroke: "var(--border)" }}
        strokeWidth="2"
      />
      <circle cx="104" cy="78" r="3.2" fill="#6366f1" />
      {/* brilhos */}
      <path
        d="M112 40 l2 4 4 2 -4 2 -2 4 -2 -4 -4 -2 4 -2z"
        fill="#6366f1"
        opacity=".7"
      />
      <circle cx="34" cy="46" r="2" fill="#6366f1" opacity=".6" />
    </svg>
  );
}

export function EmptyState({
  icon,
  illustration,
  title,
  description,
  action,
}: {
  /** ícone (renderizado grande num círculo) — usado quando não há ilustração */
  icon?: React.ReactNode;
  /** ilustração customizada; se ausente e sem ícone, usa a carteira padrão */
  illustration?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  const art =
    illustration ??
    (icon ? (
      <span className="flex h-20 w-20 items-center justify-center rounded-full bg-primary/10 text-primary [&_svg]:h-9 [&_svg]:w-9">
        {icon}
      </span>
    ) : (
      <WalletIllustration />
    ));

  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      <div className="mb-3">{art}</div>
      <p className="text-base font-bold">{title}</p>
      {description && (
        <p className="mt-1 max-w-[260px] text-sm leading-relaxed text-muted">
          {description}
        </p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
