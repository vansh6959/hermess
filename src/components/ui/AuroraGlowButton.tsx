"use client";

import React, {
  forwardRef,
  useCallback,
  useId,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
} from "react";

export type AuroraVariant = "primary" | "quiet" | "ghost";
export type AuroraSize = "sm" | "md" | "lg";
export type AuroraPalette = "boreal" | "verdant" | "violet";

export interface AuroraGlowButtonProps
  extends Omit<React.HTMLAttributes<HTMLElement>, "onClick"> {
  children?: ReactNode;
  href?: string;
  onClick?: (event: MouseEvent<AuroraElement>) => void;
  type?: "button" | "submit" | "reset";
  variant?: AuroraVariant;
  size?: AuroraSize;
  palette?: AuroraPalette;
  disabled?: boolean;
  className?: string;
  lit?: boolean;
  target?: string;
  rel?: string;
}

type AuroraElement = HTMLAnchorElement | HTMLButtonElement;

/**
 * Static CSS rules for AuroraGlowButton.
 * Per specification:
 * - Nothing is interpolated into this static <style> block.
 * - Colours arrive strictly through CSS variables (--au-core, --au-core2, etc.).
 * - Zero dependencies beyond React.
 */
const AURORA_STATIC_STYLE = `
@property --au-a {
  syntax: "<angle>";
  inherits: false;
  initial-value: 0deg;
}

@keyframes aurora-rotate {
  from {
    --au-a: 0deg;
  }
  to {
    --au-a: 360deg;
  }
}

@keyframes aurora-ripple-expand {
  0% {
    transform: translate(-50%, -50%) scale(0.65);
    opacity: 0.95;
  }
  100% {
    transform: translate(-50%, -50%) scale(1.18, 1.5);
    opacity: 0;
  }
}

.aurora-btn {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  vertical-align: middle;
  border-radius: 9999px;
  background: transparent;
  border: none;
  outline: none;
  cursor: pointer;
  text-decoration: none;
  font-family: var(--font-sans, "Geist", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif);
  font-weight: 600;
  color: rgba(236, 244, 248, 0.94);
  user-select: none;
  -webkit-tap-highlight-color: transparent;
  transition: transform 120ms cubic-bezier(0.16, 1, 0.3, 1);
  isolation: isolate;
  padding: 0;
  margin: 0;
  box-sizing: border-box;
}

.aurora-btn:active:not(.aurora-btn--disabled) {
  transform: scale(0.97);
}

.aurora-btn--disabled {
  pointer-events: none;
  opacity: 0.42;
  cursor: not-allowed;
}

/* Sizes */
.aurora-btn--sm {
  height: 32px;
  padding: 0 14px;
  font-size: 12px;
}
.aurora-btn--md {
  height: 40px;
  padding: 0 18px;
  font-size: 13.5px;
}
.aurora-btn--lg {
  height: 48px;
  padding: 0 24px;
  font-size: 15px;
}

/* Palette resting variables in stylesheet (never inline) */
.aurora-palette--boreal {
  --au-core: #7cf5c4;
  --au-core2: #38bdf8;
  --au-blend: #a78bfa;
  --au-crown: #f472b6;
  --au-fringe: #5b6cc4;
}

.aurora-palette--verdant {
  --au-core: #6ee7a0;
  --au-core2: #38bdf8;
  --au-blend: #a78bfa;
  --au-crown: #f472b6;
  --au-fringe: #5b6cc4;
}

.aurora-palette--violet {
  --au-core: #a78bfa;
  --au-core2: #7cf5c4;
  --au-blend: #38bdf8;
  --au-crown: #f472b6;
  --au-fringe: #5b6cc4;
}

/* Behind the pill: Glow span */
.aurora-glow {
  position: absolute;
  inset: -6px -8px -12px;
  z-index: 0;
  border-radius: 9999px;
  filter: blur(14px);
  opacity: 0.55;
  background: conic-gradient(
    from var(--au-a),
    var(--au-core, #7cf5c4),
    var(--au-core2, #38bdf8),
    var(--au-blend, #a78bfa),
    var(--au-core2, #38bdf8),
    var(--au-core, #7cf5c4)
  );
  animation: aurora-rotate 60s linear infinite;
  pointer-events: none;
  transition: inset 220ms ease, opacity 220ms ease;
  will-change: inset, opacity;
}

/* Static 2% dither against banding */
.aurora-glow::before {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: inherit;
  opacity: 0.02;
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='au-dither'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23au-dither)'/%3E%3C/svg%3E");
  pointer-events: none;
}

/* Hover or focus-visible: glow grows and brightens */
.aurora-btn:hover .aurora-glow,
.aurora-btn:focus-visible .aurora-glow {
  inset: -12px -14px -18px;
  opacity: 0.85;
}

/* Quiet: transparent with hairline; hover keeps the face dark so the
   aurora reads as a halo instead of washing the label. */
.aurora-btn--quiet .aurora-glow {
  opacity: 0;
  filter: blur(11px);
}

.aurora-btn--quiet:hover .aurora-glow,
.aurora-btn--quiet:focus-visible .aurora-glow {
  inset: -9px -11px -15px;
  opacity: 0.32;
}

.aurora-btn--quiet:hover .aurora-pill,
.aurora-btn--quiet:focus-visible .aurora-pill {
  background: rgba(8, 11, 11, 0.45);
}

/* Ghost variant */
.aurora-btn--ghost .aurora-glow {
  opacity: 0;
}
.aurora-btn--ghost:hover .aurora-glow,
.aurora-btn--ghost:focus-visible .aurora-glow {
  opacity: 0.3;
}

/* The dark glass pill */
.aurora-pill {
  position: absolute;
  inset: 0;
  z-index: 1;
  border-radius: 9999px;
  pointer-events: none;
  background: linear-gradient(180deg, #0f141a 0%, #0a0d12 100%);
  border: 1px solid rgba(236, 244, 248, 0.16);
  box-shadow: 0 1px 0 0 rgba(236, 244, 248, 0.08) inset;
  transition: background 220ms ease, border-color 220ms ease;
}

.aurora-btn--quiet .aurora-pill {
  background: transparent;
  border: 1px solid rgba(236, 244, 248, 0.16);
  box-shadow: none;
}

.aurora-btn--ghost .aurora-pill {
  background: transparent;
  border: 1px solid transparent;
  box-shadow: none;
}

/* 1px lit rim across the top edge: horizontal gradient of core hues, fading at both ends */
.aurora-rim {
  position: absolute;
  top: 0;
  left: 10%;
  right: 10%;
  height: 1px;
  z-index: 2;
  pointer-events: none;
  background: linear-gradient(
    90deg,
    transparent 0%,
    var(--au-core, #7cf5c4) 30%,
    var(--au-core2, #38bdf8) 50%,
    var(--au-core, #7cf5c4) 70%,
    transparent 100%
  );
  opacity: 0.85;
}

.aurora-btn--quiet .aurora-rim {
  opacity: 0.35;
}
.aurora-btn--quiet:hover .aurora-rim,
.aurora-btn--quiet:focus-visible .aurora-rim {
  opacity: 0.7;
}

.aurora-btn--ghost .aurora-rim {
  display: none;
}

/* Keyed ripple on pointerdown */
.aurora-ripple {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 100%;
  height: 100%;
  border-radius: 9999px;
  border: 1px solid var(--au-core, #7cf5c4);
  box-shadow:
    0 0 12px var(--au-core, #7cf5c4),
    0 0 24px var(--au-core2, #38bdf8);
  pointer-events: none;
  z-index: 3;
  animation: aurora-ripple-expand 380ms cubic-bezier(0.16, 1, 0.3, 1) forwards;
}

/* Content */
.aurora-content {
  position: relative;
  z-index: 4;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  height: 100%;
  pointer-events: none;
}

/* Lit typography override (Bricolage Grotesque at 600-650 for display type) */
.aurora-btn--lit .aurora-content {
  font-family: var(--font-bricolage, "Bricolage Grotesque", var(--font-sans, "Geist", sans-serif));
  font-weight: 650;
  letter-spacing: -0.015em;
}

/* Focus visible */
.aurora-btn:focus-visible {
  outline: 2px solid var(--au-core, #7cf5c4);
  outline-offset: 2px;
}

/* Prefers-reduced-motion: still sky, no chases. Geometry stays put so hover
   cannot pop the halo larger; variants keep their own resting opacity. */
@media (prefers-reduced-motion: reduce) {
  .aurora-glow {
    animation: none !important;
  }
  .aurora-btn:hover .aurora-glow,
  .aurora-btn:focus-visible .aurora-glow {
    inset: -6px -8px -12px;
  }
  .aurora-btn,
  .aurora-btn:hover .aurora-glow,
  .aurora-btn:focus-visible .aurora-glow {
    transition: none !important;
  }
  .aurora-ripple {
    animation: none !important;
    display: none !important;
  }
}
`;

const sizeClass: Record<AuroraSize, string> = {
  sm: "aurora-btn--sm",
  md: "aurora-btn--md",
  lg: "aurora-btn--lg",
};

const variantClass: Record<AuroraVariant, string> = {
  primary: "aurora-btn--primary",
  quiet: "aurora-btn--quiet",
  ghost: "aurora-btn--ghost",
};

const paletteClass: Record<AuroraPalette, string> = {
  boreal: "aurora-palette--boreal",
  verdant: "aurora-palette--verdant",
  violet: "aurora-palette--violet",
};

export const AuroraGlowButton = forwardRef<AuroraElement, AuroraGlowButtonProps>(
  function AuroraGlowButton(
    {
      children,
      href,
      onClick,
      type = "button",
      variant = "primary",
      size = "md",
      palette = "boreal",
      disabled = false,
      className = "",
      lit = false,
      target,
      rel,
      tabIndex,
      ...restProps
    },
    forwardedRef,
  ) {
    const styleId = useId();
    const btnRef = useRef<AuroraElement | null>(null);
    const [rippleKey, setRippleKey] = useState<number | null>(null);
    const rippleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Merge external ref with internal ref
    const setComponentRef = useCallback(
      (node: AuroraElement | null) => {
        btnRef.current = node;
        if (typeof forwardedRef === "function") {
          forwardedRef(node);
        } else if (forwardedRef) {
          (forwardedRef as { current: AuroraElement | null }).current = node;
        }
      },
      [forwardedRef],
    );

    // Clock synchronization ref callback:
    // Sets animation-delay to -(performance.now() / 1000 % 60)s so newly mounted buttons stay in sync with the page clock.
    const setGlowRef = useCallback((el: HTMLSpanElement | null) => {
      if (el) {
        const offset = (performance.now() / 1000) % 60;
        el.style.animationDelay = `-${offset}s`;
      }
    }, []);

    // Pointerdown keyed ripple trigger: scales to 1.18 x 1.5 and fades over 380ms
    const handlePointerDown = useCallback(() => {
      if (disabled) return;
      if (rippleTimer.current) clearTimeout(rippleTimer.current);

      setRippleKey(Date.now() + Math.random());
      rippleTimer.current = setTimeout(() => {
        setRippleKey(null);
      }, 400);
    }, [disabled]);

    const handleClick = useCallback(
      (event: MouseEvent<AuroraElement>) => {
        if (disabled) {
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        onClick?.(event);
      },
      [disabled, onClick],
    );

    const fullClassName = [
      "aurora-btn",
      sizeClass[size],
      variantClass[variant],
      paletteClass[palette],
      lit ? "aurora-btn--lit" : "",
      disabled ? "aurora-btn--disabled" : "",
      className,
    ]
      .filter(Boolean)
      .join(" ");

    const commonProps = {
      ref: setComponentRef,
      className: fullClassName,
      onClick: handleClick,
      onPointerDown: handlePointerDown,
      tabIndex: disabled ? -1 : tabIndex,
      "aria-disabled": disabled ? true : undefined,
      ...restProps,
    };

    const innerContent = (
      <>
        {/* Small static style containing CSS variables and rules (nothing interpolated) */}
        <style data-aurora-style={styleId}>{AURORA_STATIC_STYLE}</style>

        {/* 1. Behind the pill: conic gradient glow span synced to 60s clock */}
        <span ref={setGlowRef} className="aurora-glow" aria-hidden />

        {/* 2. The dark glass pill */}
        <span className="aurora-pill" aria-hidden />

        {/* 3. 1px lit rim across top edge */}
        <span className="aurora-rim" aria-hidden />

        {/* 4. On pointerdown: keyed ripple span */}
        {rippleKey !== null && (
          <span key={rippleKey} className="aurora-ripple" aria-hidden />
        )}

        {/* 5. Button content */}
        <span className="aurora-content">{children}</span>
      </>
    );

    if (href) {
      return (
        <a
          {...commonProps}
          href={disabled ? undefined : href}
          target={target}
          rel={rel}
        >
          {innerContent}
        </a>
      );
    }

    return (
      <button
        {...commonProps}
        type={type}
        disabled={disabled}
      >
        {innerContent}
      </button>
    );
  },
);

AuroraGlowButton.displayName = "AuroraGlowButton";
