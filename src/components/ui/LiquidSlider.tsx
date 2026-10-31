"use client";

import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";

interface LiquidSliderProps {
  value: number;
  max: number;
  onChange: (value: number) => void;
  onCommit?: (value: number) => void;
  ariaLabel: string;
  ariaValueText?: string;
  step?: number;
  className?: string;
  disabled?: boolean;
}

export function LiquidSlider({
  value,
  max,
  onChange,
  onCommit,
  ariaLabel,
  ariaValueText,
  step = 1,
  className,
  disabled,
}: LiquidSliderProps) {
  const safeMax = Math.max(max, 1);
  const percentage = Math.min(100, Math.max(0, (value / safeMax) * 100));
  return (
    <input
      type="range"
      min={0}
      max={safeMax}
      step={step}
      value={Math.min(value, safeMax)}
      aria-label={ariaLabel}
      aria-valuetext={
        ariaValueText ??
        (safeMax <= 1 ? `${Math.round(percentage)}%` : undefined)
      }
      disabled={disabled}
      onChange={(event) => onChange(Number(event.target.value))}
      onPointerUp={() => onCommit?.(value)}
      onKeyUp={() => onCommit?.(value)}
      className={cn("range", className)}
      style={{ "--range-fill": `${percentage}%` } as CSSProperties}
    />
  );
}
