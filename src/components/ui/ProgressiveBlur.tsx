"use client";

import { cn } from "@/lib/utils";

const ANGLES = {
  top: 0,
  right: 90,
  bottom: 180,
  left: 270,
} as const;

interface ProgressiveBlurProps {
  direction?: keyof typeof ANGLES;
  layers?: number;
  blurIntensity?: number;
  className?: string;
}

// Adapted from Efferd UI's ProgressiveBlur component
// (https://github.com/sshahaider/efferd-ui, MIT License,
// Copyright (c) 2025 sshahaider), rewritten without the motion dependency.
export function ProgressiveBlur({
  direction = "bottom",
  layers = 5,
  blurIntensity = 0.8,
  className,
}: ProgressiveBlurProps) {
  const count = Math.max(2, layers);
  const segment = 1 / (count + 1);
  const angle = ANGLES[direction];

  return (
    <div className={cn("pointer-events-none relative", className)} aria-hidden>
      {Array.from({ length: count }).map((_, index) => {
        const stops = [index, index + 1, index + 2, index + 3].map(
          (position, stopIndex) =>
            `rgba(255, 255, 255, ${
              stopIndex === 1 || stopIndex === 2 ? 1 : 0
            }) ${position * segment * 100}%`,
        );
        const gradient = `linear-gradient(${angle}deg, ${stops.join(", ")})`;

        return (
          <div
            key={index}
            className="pointer-events-none absolute inset-0 rounded-[inherit]"
            style={{
              maskImage: gradient,
              WebkitMaskImage: gradient,
              backdropFilter: `blur(${index * blurIntensity}px)`,
              WebkitBackdropFilter: `blur(${index * blurIntensity}px)`,
            }}
          />
        );
      })}
    </div>
  );
}
