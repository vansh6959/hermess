"use client";

import React, {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
  type ReactNode,
} from "react";

export interface NavLink {
  id: string | number;
  label: string;
  href?: string;
}

export interface CtaLink {
  label: string;
  href?: string;
  onClick?: () => void;
}

export interface MercuryPourNavProps {
  brand?: ReactNode | string;
  links: NavLink[];
  active?: string | number;
  onSelect?: (id: string | number, index: number) => void;
  cta?: CtaLink;
  finish?: "chrome" | "gold" | "rose" | "cobalt" | string;
  className?: string;
  style?: CSSProperties;
}

/**
 * Liquid Chrome grammar:
 * - Four bands arranged as bright sky over hard dark horizon over lit floor
 * - Color finishes: chrome, gold, rose, cobalt, or validated #rrggbb
 */
const BANDS = ["#08090b", "#4b4f58", "#c9ced6", "#ffffff"] as const;

const FINISHES: Record<string, string> = {
  chrome: "#ffffff",
  gold: "#f2cf92",
  rose: "#f1bcb4",
  cobalt: "#b9cbff",
};

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

function parseHex(hex: string): { r: number; g: number; b: number } | null {
  const m = HEX_RE.exec(hex);
  if (!m) return null;
  return {
    r: parseInt(m[0].slice(1, 3), 16),
    g: parseInt(m[0].slice(3, 5), 16),
    b: parseInt(m[0].slice(5, 7), 16),
  };
}

function multiplyColor(bandHex: string, finishHex: string): string {
  const b = parseHex(bandHex);
  const f = parseHex(finishHex);
  if (!b || !f) return bandHex;
  const r = Math.round((b.r * f.r) / 255);
  const g = Math.round((b.g * f.g) / 255);
  const bVal = Math.round((b.b * f.b) / 255);
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${bVal.toString(16).padStart(2, "0")}`;
}

/**
 * Damped harmonic spring physics:
 * dampingRatio = 0.72
 * c = 2 * dampingRatio * sqrt(k) = 1.44 * sqrt(k)
 */
const STIFFNESS_LEAD = 520;
const STIFFNESS_TRAIL = 170;
const DAMPING_RATIO = 0.72;

function calcDamping(k: number): number {
  return 2 * DAMPING_RATIO * Math.sqrt(k);
}

const C_LEAD = calcDamping(STIFFNESS_LEAD);
const C_TRAIL = calcDamping(STIFFNESS_TRAIL);

/**
 * Static CSS rules for MercuryPourNav.
 * Per specification:
 * - Keyframes and a focus ring (a .lc-scope rule with border-radius: revert-layer) live in this static <style>.
 * - Nothing is interpolated into it.
 * - Respects prefers-reduced-motion.
 * - No dependencies beyond React.
 */
const MERCURY_STATIC_STYLE = `
@keyframes lc-ambient-drift {
  0% {
    background-position: 0% 50%;
  }
  50% {
    background-position: 100% 50%;
  }
  100% {
    background-position: 0% 50%;
  }
}

.mercury-nav {
  position: relative;
  display: inline-flex;
  align-items: center;
  height: 52px;
  padding: 0 12px 0 16px;
  border-radius: 26px;
  background: rgba(12, 13, 16, 0.72);
  backdrop-filter: blur(14px) saturate(1.2);
  -webkit-backdrop-filter: blur(14px) saturate(1.2);
  box-shadow:
    inset 0 0 0 1px rgba(255, 255, 255, 0.07),
    inset 0 1px 0 0 rgba(255, 255, 255, 0.16),
    0 20px 48px -18px rgba(0, 0, 0, 0.85);
  user-select: none;
  isolation: isolate;
  max-width: 100%;
}

.mercury-brand {
  flex: 0 0 auto;
  font-family: var(--font-display, "Archivo", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif);
  font-weight: 800;
  font-stretch: 125%;
  letter-spacing: -0.02em;
  font-size: 15px;
  text-transform: uppercase;
  color: rgba(244, 245, 247, 0.94);
  margin-right: 14px;
  white-space: nowrap;
}

.mercury-row {
  position: relative;
  display: flex;
  align-items: center;
  gap: 2px;
  overflow-x: auto;
  scrollbar-width: none;
  width: max-content;
  max-width: 100%;
  height: 100%;
}

.mercury-row::-webkit-scrollbar {
  display: none;
}

/* Mercury capsule: chrome room gradient with a glint and inset highlight */
.mercury-capsule {
  position: absolute;
  top: 7px;
  bottom: 7px;
  left: 0;
  border-radius: 9999px;
  background: linear-gradient(
    180deg,
    var(--lc-3, #ffffff) 0%,
    var(--lc-2, #c9ced6) calc(var(--lc-h, 50%) - 6%),
    var(--lc-0, #08090b) var(--lc-h, 50%),
    var(--lc-1, #4b4f58) 100%
  );
  box-shadow:
    inset 0 1px 1px 0 rgba(255, 255, 255, 0.75),
    inset 0 -1px 1px 0 rgba(0, 0, 0, 0.5),
    0 4px 14px -2px rgba(0, 0, 0, 0.6);
  z-index: 1;
  pointer-events: none;
  transform-origin: center center;
  will-change: transform, width, opacity;
}

/* Chrome glint specular highlight */
.mercury-capsule-glint {
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background: linear-gradient(
    90deg,
    transparent 0%,
    rgba(255, 255, 255, 0.45) 45%,
    rgba(255, 255, 255, 0.75) 50%,
    transparent 65%
  );
  opacity: 0.6;
  pointer-events: none;
}

/* Inset highlight rim */
.mercury-capsule-inset {
  position: absolute;
  inset: 0;
  border-radius: inherit;
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.2);
  pointer-events: none;
}

/* Base links (light ink) */
.mercury-link {
  position: relative;
  z-index: 2;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 38px;
  padding: 0 14px;
  border-radius: 9999px;
  font-family: var(--font-sans, "Geist", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif);
  font-size: 13px;
  font-weight: 500;
  color: rgba(244, 245, 247, 0.62);
  text-decoration: none;
  white-space: nowrap;
  background: transparent;
  border: none;
  outline: none;
  cursor: pointer;
  transition: color 180ms ease, transform 130ms cubic-bezier(0.16, 1, 0.3, 1);
  -webkit-tap-highlight-color: transparent;
}

.mercury-link:hover,
.mercury-link:focus-visible {
  color: rgba(244, 245, 247, 0.94);
}

.mercury-link:active {
  transform: scale(0.96);
}

/* Second copy of labels in dark ink, above the links, clipped to the mercury capsule */
.mercury-dark-labels {
  position: absolute;
  inset: 0;
  z-index: 3;
  display: flex;
  align-items: center;
  gap: 2px;
  pointer-events: none;
  user-select: none;
  width: max-content;
}

.mercury-dark-label {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 38px;
  padding: 0 14px;
  font-family: var(--font-sans, "Geist", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif);
  font-size: 13px;
  font-weight: 650;
  color: #0c0d10;
  white-space: nowrap;
}

/* Optional outlined CTA link at the end */
.mercury-cta {
  position: relative;
  z-index: 2;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 36px;
  padding: 0 14px;
  margin-left: 6px;
  border-radius: 9999px;
  font-family: var(--font-sans, "Geist", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif);
  font-size: 12.5px;
  font-weight: 600;
  color: rgba(244, 245, 247, 0.94);
  text-decoration: none;
  white-space: nowrap;
  background: rgba(255, 255, 255, 0.03);
  box-shadow:
    inset 0 0 0 1px rgba(255, 255, 255, 0.16),
    inset 0 1px 0 0 rgba(255, 255, 255, 0.12);
  outline: none;
  cursor: pointer;
  transition: background 180ms ease, box-shadow 180ms ease, transform 130ms cubic-bezier(0.16, 1, 0.3, 1);
}

.mercury-cta:hover,
.mercury-cta:focus-visible {
  background: rgba(255, 255, 255, 0.08);
  box-shadow:
    inset 0 0 0 1px rgba(255, 255, 255, 0.32),
    inset 0 1px 0 0 rgba(255, 255, 255, 0.24);
}

.mercury-cta:active {
  transform: scale(0.96);
}

/* Focus ring: .lc-scope with border-radius: revert-layer per specification */
.lc-scope :focus-visible {
  outline: 2px solid var(--lc-2, #c9ced6);
  outline-offset: 2px;
  border-radius: revert-layer;
}

/* Reduced motion jumps */
@media (prefers-reduced-motion: reduce) {
  .mercury-capsule {
    transition: none !important;
    animation: none !important;
  }
  .mercury-link,
  .mercury-cta {
    transition: none !important;
  }
}
`;

export function MercuryPourNav({
  brand,
  links,
  active: activeProp,
  onSelect,
  cta,
  finish: finishProp = "chrome",
  className = "",
  style,
}: MercuryPourNavProps) {
  const styleId = useId();
  const navRef = useRef<HTMLElement>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  const capsuleRef = useRef<HTMLSpanElement>(null);
  const darkLabelsRef = useRef<HTMLDivElement>(null);

  // Controlled vs uncontrolled active state
  const isControlled = activeProp !== undefined;
  const [internalActive, setInternalActive] = useState<string | number>(
    isControlled ? activeProp : (links[0]?.id ?? 0),
  );

  const effectiveActive = isControlled ? activeProp : internalActive;

  // Track hovered or focused link index
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  // Measured geometries for each link relative to the row
  const linkGeosRef = useRef<
    Array<{ left: number; right: number; center: number }>
  >([]);

  // Damped spring simulation state for left and right edges
  const springState = useRef({
    left: 0,
    right: 0,
    vLeft: 0,
    vRight: 0,
    targetLeft: 0,
    targetRight: 0,
  });

  const rafId = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(0);
  const prefersReducedMotionRef = useRef<boolean>(false);

  // Compute chrome finish bands via color multiplication
  const finishHex = useMemo(() => {
    if (finishProp && HEX_RE.test(finishProp)) return finishProp;
    if (FINISHES[finishProp]) return FINISHES[finishProp];
    return FINISHES.chrome;
  }, [finishProp]);

  const lcVars = useMemo(() => {
    return {
      "--lc-0": multiplyColor(BANDS[0], finishHex),
      "--lc-1": multiplyColor(BANDS[1], finishHex),
      "--lc-2": multiplyColor(BANDS[2], finishHex),
      "--lc-3": multiplyColor(BANDS[3], finishHex),
      ...style,
    } as CSSProperties;
  }, [finishHex, style]);

  // Reduced motion media query check
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    prefersReducedMotionRef.current = mq.matches;
    const listener = (e: MediaQueryListEvent) => {
      prefersReducedMotionRef.current = e.matches;
    };
    mq.addEventListener("change", listener);
    return () => mq.removeEventListener("change", listener);
  }, []);

  // Measure link geometries relative to row container
  const measureLinks = useCallback(() => {
    const row = rowRef.current;
    if (!row) return;
    const linkEls = row.querySelectorAll<HTMLElement>("[data-mercury-link]");
    const rowRect = row.getBoundingClientRect();

    const geos: Array<{ left: number; right: number; center: number }> = [];
    linkEls.forEach((el) => {
      const rect = el.getBoundingClientRect();
      const left = rect.left - rowRect.left;
      const right = rect.right - rowRect.left;
      geos.push({
        left,
        right,
        center: (left + right) / 2,
      });
    });

    linkGeosRef.current = geos;
  }, []);

  // Re-measure on mount, links change, and resize
  useEffect(() => {
    measureLinks();
    if (typeof window === "undefined") return;

    window.addEventListener("resize", measureLinks);
    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(measureLinks);
      if (rowRef.current) ro.observe(rowRef.current);
      if (navRef.current) ro.observe(navRef.current);
    }

    return () => {
      window.removeEventListener("resize", measureLinks);
      ro?.disconnect();
    };
  }, [measureLinks, links]);

  // Find index of current active link
  const activeIdx = useMemo(() => {
    if (effectiveActive === -1 || effectiveActive === "-1") return -1;
    const foundByIdx = links.findIndex(
      (link, i) =>
        link.id === effectiveActive ||
        i === effectiveActive ||
        String(link.id) === String(effectiveActive),
    );
    return foundByIdx;
  }, [effectiveActive, links]);

  // Animation frame loop for dual damped springs
  const startRafLoop = useCallback(() => {
    if (rafId.current !== null) return;
    lastTimeRef.current = performance.now();

    const step = (now: number) => {
      const dt = Math.min(0.032, Math.max(0.001, (now - lastTimeRef.current) / 1000));
      lastTimeRef.current = now;

      const state = springState.current;
      const currentCenter = (state.left + state.right) / 2;
      const targetCenter = (state.targetLeft + state.targetRight) / 2;
      const isMovingRight = targetCenter >= currentCenter;

      // Leading edge has stiffness 520, trailing edge 170
      const kLeft = isMovingRight ? STIFFNESS_TRAIL : STIFFNESS_LEAD;
      const cLeft = isMovingRight ? C_TRAIL : C_LEAD;

      const kRight = isMovingRight ? STIFFNESS_LEAD : STIFFNESS_TRAIL;
      const cRight = isMovingRight ? C_LEAD : C_TRAIL;

      // Semi-implicit Euler integration
      const fLeft = -kLeft * (state.left - state.targetLeft) - cLeft * state.vLeft;
      state.vLeft += fLeft * dt;
      state.left += state.vLeft * dt;

      const fRight = -kRight * (state.right - state.targetRight) - cRight * state.vRight;
      state.vRight += fRight * dt;
      state.right += state.vRight * dt;

      // Capsule geometry
      const width = Math.max(0, state.right - state.left);
      const translateX = state.left;

      // Stretch & scaleY: scaleY down by up to 28% in proportion to stretch
      const restWidth = Math.max(1, state.targetRight - state.targetLeft);
      const stretch = width > restWidth ? (width - restWidth) / restWidth : 0;
      const scaleY = Math.max(0.72, 1 - 0.28 * Math.min(stretch, 1));

      // Speed & horizon shift: --lc-h shifted by edges' speed
      const speed = Math.abs(state.vLeft) + Math.abs(state.vRight);
      const shift = Math.min(25, speed * 0.035);
      const lcH = Math.min(85, Math.max(15, 50 + (isMovingRight ? shift : -shift)));

      // Opacity: 0 below 6px
      const opacity = width < 6 ? 0 : 1;

      // Apply styles to capsule
      const capsule = capsuleRef.current;
      if (capsule) {
        capsule.style.transform = `translateX(${translateX.toFixed(2)}px) scaleY(${scaleY.toFixed(3)})`;
        capsule.style.width = `${width.toFixed(2)}px`;
        capsule.style.opacity = String(opacity);
        capsule.style.setProperty("--lc-h", `${lcH.toFixed(1)}%`);
      }

      // Clip dark labels to inset(0 right 0 left round 999px)
      const darkLabels = darkLabelsRef.current;
      const row = rowRef.current;
      if (darkLabels && row) {
        const rowWidth = row.offsetWidth;
        const clipRight = Math.max(0, rowWidth - state.right);
        const clipLeft = Math.max(0, state.left);

        if (width < 6) {
          darkLabels.style.clipPath = "inset(0px 100% 0px 0px round 999px)";
        } else {
          darkLabels.style.clipPath = `inset(0px ${clipRight.toFixed(2)}px 0px ${clipLeft.toFixed(2)}px round 999px)`;
        }
      }

      // Check if settled
      const settled =
        Math.abs(state.vLeft) < 0.2 &&
        Math.abs(state.vRight) < 0.2 &&
        Math.abs(state.left - state.targetLeft) < 0.2 &&
        Math.abs(state.right - state.targetRight) < 0.2;

      if (!settled && !prefersReducedMotionRef.current) {
        rafId.current = requestAnimationFrame(step);
      } else {
        // Snap to exact targets when settled
        state.left = state.targetLeft;
        state.right = state.targetRight;
        state.vLeft = 0;
        state.vRight = 0;

        if (capsule) {
          capsule.style.transform = `translateX(${state.left.toFixed(2)}px) scaleY(1)`;
          capsule.style.width = `${Math.max(0, state.right - state.left).toFixed(2)}px`;
          capsule.style.opacity = Math.max(0, state.right - state.left) < 6 ? "0" : "1";
          capsule.style.setProperty("--lc-h", "50%");
        }

        if (darkLabels && row) {
          const rowWidth = row.offsetWidth;
          const clipRight = Math.max(0, rowWidth - state.right);
          const clipLeft = Math.max(0, state.left);
          darkLabels.style.clipPath = `inset(0px ${clipRight.toFixed(2)}px 0px ${clipLeft.toFixed(2)}px round 999px)`;
        }

        rafId.current = null;
      }
    };

    rafId.current = requestAnimationFrame(step);
  }, []);

  // Update target left and right edges
  const updateTargets = useCallback(() => {
    measureLinks();
    const geos = linkGeosRef.current;
    if (geos.length === 0) return;

    let baseLeft = 0;
    let baseRight = 0;

    if (activeIdx === -1 || !geos[activeIdx]) {
      // Bead at the first link's centre when active is -1
      const first = geos[0];
      const center = first.center;
      baseLeft = center - 4;
      baseRight = center + 4;
    } else {
      const activeGeo = geos[activeIdx];
      baseLeft = activeGeo.left;
      baseRight = activeGeo.right;
    }

    let finalLeft = baseLeft;
    let finalRight = baseRight;

    // If another link is hovered or focused, leading edge reaches 24% of the way to it
    if (hoveredIdx !== null && hoveredIdx !== activeIdx && geos[hoveredIdx]) {
      const hoveredGeo = geos[hoveredIdx];
      const hoveredCenter = hoveredGeo.center;
      const currentTargetCenter = (baseLeft + baseRight) / 2;

      if (hoveredCenter > currentTargetCenter) {
        // Hovered to the right: leading edge is right
        finalRight = baseRight + 0.24 * (hoveredGeo.right - baseRight);
      } else {
        // Hovered to the left: leading edge is left
        finalLeft = baseLeft + 0.24 * (hoveredGeo.left - baseLeft);
      }
    }

    const state = springState.current;
    state.targetLeft = finalLeft;
    state.targetRight = finalRight;

    // Reduced motion jumps immediately
    if (prefersReducedMotionRef.current) {
      state.left = finalLeft;
      state.right = finalRight;
      state.vLeft = 0;
      state.vRight = 0;

      const width = Math.max(0, finalRight - finalLeft);
      const capsule = capsuleRef.current;
      if (capsule) {
        capsule.style.transform = `translateX(${finalLeft}px) scaleY(1)`;
        capsule.style.width = `${width}px`;
        capsule.style.opacity = width < 6 ? "0" : "1";
        capsule.style.setProperty("--lc-h", "50%");
      }

      const darkLabels = darkLabelsRef.current;
      const row = rowRef.current;
      if (darkLabels && row) {
        const rowWidth = row.offsetWidth;
        const clipRight = Math.max(0, rowWidth - finalRight);
        const clipLeft = Math.max(0, finalLeft);
        darkLabels.style.clipPath = `inset(0px ${clipRight.toFixed(2)}px 0px ${clipLeft.toFixed(2)}px round 999px)`;
      }
      return;
    }

    startRafLoop();
  }, [activeIdx, hoveredIdx, measureLinks, startRafLoop]);

  // Recalculate targets on active or hovered change
  useEffect(() => {
    updateTargets();
  }, [updateTargets, activeIdx, hoveredIdx]);

  // Cleanup rAF on unmount
  useEffect(() => {
    return () => {
      if (rafId.current !== null) {
        cancelAnimationFrame(rafId.current);
        rafId.current = null;
      }
    };
  }, []);

  const handleLinkClick = useCallback(
    (link: NavLink, index: number, event: MouseEvent<HTMLAnchorElement | HTMLButtonElement>) => {
      if (!link.href) {
        event.preventDefault();
      }
      if (!isControlled) {
        setInternalActive(link.id);
      }
      setHoveredIdx(null);
      onSelect?.(link.id, index);
    },
    [isControlled, onSelect],
  );

  return (
    <nav
      ref={navRef}
      className={`mercury-nav lc-scope ${className}`}
      aria-label="Main navigation"
      style={lcVars}
    >
      {/* Static style block for keyframes and focus ring (nothing interpolated) */}
      <style data-mercury-style={styleId}>{MERCURY_STATIC_STYLE}</style>

      {/* Brand in wide Archivo caps */}
      {brand && <div className="mercury-brand">{brand}</div>}

      {/* Horizontally scrolling row of links */}
      <div className="mercury-row" ref={rowRef}>
        {/* Absolutely positioned mercury capsule with aurora glow */}
        <span
          ref={capsuleRef}
          className="mercury-capsule"
          aria-hidden="true"
        >
          <span
            ref={(el) => {
              if (el) {
                el.style.animationDelay = `${-((performance.now() / 1000) % 60)}s`;
              }
            }}
            className="aurora-glow"
            aria-hidden="true"
          />
          <span className="mercury-capsule-glint" />
          <span className="mercury-capsule-inset" />
        </span>

        {/* Base link items (light ink) */}
        {links.map((link, idx) => {
          const isActive = idx === activeIdx;
          const Component = link.href ? "a" : "button";

          return (
            <Component
              key={link.id}
              href={link.href}
              type={link.href ? undefined : "button"}
              data-mercury-link
              data-active={isActive ? "true" : undefined}
              aria-current={isActive ? "page" : undefined}
              className="mercury-link"
              onClick={(e) => handleLinkClick(link, idx, e)}
              onMouseEnter={() => setHoveredIdx(idx)}
              onMouseLeave={() => setHoveredIdx(null)}
              onFocus={() => setHoveredIdx(idx)}
              onBlur={() => setHoveredIdx(null)}
            >
              {link.label}
            </Component>
          );
        })}

        {/* Second copy of labels in dark ink, above the links, clipped to mercury capsule */}
        <div
          ref={darkLabelsRef}
          className="mercury-dark-labels"
          aria-hidden="true"
        >
          {links.map((link) => (
            <span key={link.id} className="mercury-dark-label">
              {link.label}
            </span>
          ))}
        </div>

        {/* Optional outlined CTA link at the end */}
        {cta && (
          <a
            href={cta.href ?? "#"}
            className="mercury-cta"
            onClick={(e) => {
              if (cta.onClick) {
                e.preventDefault();
                cta.onClick();
              }
            }}
          >
            {cta.label}
          </a>
        )}
      </div>
    </nav>
  );
}

MercuryPourNav.displayName = "MercuryPourNav";
