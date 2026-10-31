"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

const SIZES = {
  sm: { width: 22, height: 16, stroke: 1.7, amplitude: 6, points: 11 },
  md: { width: 26, height: 18, stroke: 2, amplitude: 7.2, points: 13 },
  lg: { width: 32, height: 24, stroke: 2.3, amplitude: 9.2, points: 15 },
} as const;

type AudioPulseSize = keyof typeof SIZES;

export function AudioPulse({
  level,
  size = "md",
  className,
}: {
  level: number;
  size?: AudioPulseSize;
  className?: string;
}) {
  const pathRef = useRef<SVGPathElement>(null);
  const levelRef = useRef(0);
  const config = SIZES[size];
  const initialPath = `M2,${config.height / 2} L${config.width - 2},${config.height / 2}`;

  useEffect(() => {
    const next = Number.isFinite(level) ? Math.max(0, Math.min(1, level)) : 0;
    levelRef.current = next;
  }, [level]);

  useEffect(() => {
    const path = pathRef.current;
    if (!path) return;

    const center = config.height / 2;
    const step = (config.width - 4) / (config.points - 1);
    let frame = 0;
    let smoothed = 0;
    let last = performance.now();

    const draw = (now: number) => {
      const elapsed = Math.max(1, Math.min(48, now - last));
      last = now;
      const target = levelRef.current;
      const timeConstant = target > smoothed ? 90 : 220;
      smoothed += (target - smoothed) * (1 - Math.exp(-elapsed / timeConstant));

      const reduced = document.documentElement.dataset.motion === "reduced";
      if (!reduced) {
        const time = now / 1000;
        const breath = 0.78 + 0.22 * Math.sin(time * 2.2 + 0.6);
        let d = "";
        for (let index = 0; index < config.points; index += 1) {
          const progress = index / (config.points - 1);
          const taper = Math.sin(Math.PI * progress) ** 0.55;
          const wave =
            0.58 * Math.sin(time * 5.2 + index * 0.84) +
            0.28 * Math.sin(time * 8.7 - index * 0.57) +
            0.14 * Math.sin(time * 13.1 + index * 1.23);
          const x = 2 + index * step;
          const y =
            center + wave * smoothed * config.amplitude * breath * taper;
          d += `${index === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)} `;
        }
        path.setAttribute("d", d.trim());
      }

      frame = window.requestAnimationFrame(draw);
    };

    frame = window.requestAnimationFrame(draw);
    return () => window.cancelAnimationFrame(frame);
  }, [config]);

  return (
    <span
      className={cn("audio-pulse", className)}
      data-size={size}
      data-testid="audio-pulse"
      aria-hidden
    >
      <svg
        className="audio-pulse__wave"
        viewBox={`0 0 ${config.width} ${config.height}`}
        width={config.width}
        height={config.height}
        focusable="false"
      >
        <line
          className="audio-pulse__baseline"
          x1={2}
          x2={config.width - 2}
          y1={config.height / 2}
          y2={config.height / 2}
          stroke="currentColor"
          strokeWidth={config.stroke * 0.8}
          strokeLinecap="round"
        />
        <path
          ref={pathRef}
          d={initialPath}
          fill="none"
          stroke="currentColor"
          strokeWidth={config.stroke}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span className="audio-pulse__pause">
        <span />
        <span />
      </span>
    </span>
  );
}
