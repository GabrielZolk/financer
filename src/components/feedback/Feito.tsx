import { useEffect, useState } from "react";
import "./feito.css";

export type FeitoVariant = "check" | "coin" | "confetti";

interface FeitoState {
  variant: FeitoVariant;
  label?: string;
  key: number;
}

// setter singleton — preenchido enquanto o overlay estiver montado (uma vez no AppShell).
let emit: ((variant: FeitoVariant, label?: string) => void) | null = null;
let counter = 0;

/**
 * Dispara a animação de confirmação em qualquer lugar do app.
 *  - "check": ação cotidiana (salvar lançamento)
 *  - "coin": conquista de dinheiro (aporte em meta, fatura paga)
 *  - "confetti": comemoração grande (meta atingida) — passe o label com o valor
 */
export function celebrate(variant: FeitoVariant = "check", label?: string) {
  emit?.(variant, label);
}

const DURATION: Record<FeitoVariant, number> = {
  check: 1300,
  coin: 1700,
  confetti: 1700,
};

const CONFETTI_COLORS = ["#6366f1", "#22c55e", "#f59e0b", "#ec4899", "#0ea5e9"];

export function FeitoOverlay() {
  const [state, setState] = useState<FeitoState | null>(null);

  useEffect(() => {
    emit = (variant, label) => setState({ variant, label, key: ++counter });
    return () => {
      emit = null;
    };
  }, []);

  useEffect(() => {
    if (!state) return;
    const t = setTimeout(() => setState(null), DURATION[state.variant]);
    return () => clearTimeout(t);
  }, [state]);

  if (!state) return null;

  return (
    <div className="feito-overlay" onClick={() => setState(null)}>
      <div className="feito-box" key={state.key}>
        {state.variant === "check" && <CheckAnim />}
        {state.variant === "coin" && <CoinAnim />}
        {state.variant === "confetti" && <ConfettiAnim />}
        <div className="feito-text">Feito!</div>
        {state.label && <div className="feito-label">{state.label}</div>}
      </div>
    </div>
  );
}

function CheckAnim() {
  return (
    <svg className="feito-check" viewBox="0 0 110 110">
      <circle className="glow" cx="55" cy="55" r="47" />
      <circle className="ring" cx="55" cy="55" r="47" />
      <path className="tick" d="M34 57 l14 14 l28 -30" />
    </svg>
  );
}

function CoinAnim() {
  return (
    <div className="feito-coinwrap">
      <div className="feito-coin-out">
        <div className="feito-coin">
          <span>$</span>
        </div>
      </div>
    </div>
  );
}

function ConfettiAnim() {
  const pieces = Array.from({ length: 14 }, (_, i) => {
    const ang = (Math.PI * 2 * i) / 14 + (i % 2 ? 0.3 : 0);
    const dist = 60 + (i % 3) * 22;
    return {
      dx: `${Math.cos(ang) * dist}px`,
      dy: `${Math.sin(ang) * dist - 24}px`,
      rot: `${(i * 47) % 360}deg`,
      color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      delay: `${i * 18}ms`,
    };
  });
  return (
    <div className="feito-confetti-stage">
      {pieces.map((p, i) => (
        <span
          key={i}
          className="feito-confetti"
          style={
            {
              "--dx": p.dx,
              "--dy": p.dy,
              "--rot": p.rot,
              background: p.color,
              animationDelay: p.delay,
            } as React.CSSProperties
          }
        />
      ))}
      <span className="feito-value">conquista!</span>
    </div>
  );
}
