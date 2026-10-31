"use client";

import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

interface LiquidCardProps extends HTMLAttributes<HTMLDivElement> {
  interactive?: boolean;
  raised?: boolean;
  children?: ReactNode;
}

export function LiquidCard({
  className,
  interactive = false,
  raised = false,
  children,
  ...props
}: LiquidCardProps) {
  return (
    <div
      className={cn(
        raised ? "liquid-raised rim grain" : "liquid rim",
        "relative rounded-3xl",
        interactive &&
          "transition-transform duration-300 ease-spring hover:-translate-y-0.5",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

interface LiquidPanelProps extends HTMLAttributes<HTMLDivElement> {
  title?: string;
  description?: string;
  action?: ReactNode;
  padded?: boolean;
}

export function LiquidPanel({
  className,
  title,
  description,
  action,
  padded = true,
  children,
  ...props
}: LiquidPanelProps) {
  return (
    <section className={cn("liquid rim rounded-3xl", padded && "p-5 sm:p-6", className)} {...props}>
      {(title || action) && (
        <header className="mb-4 flex items-start justify-between gap-4">
          <div>
            {title && (
              <h2 className="text-lg font-semibold tracking-tight text-white">
                {title}
              </h2>
            )}
            {description && (
              <p className="mt-1 text-[13px] leading-relaxed text-[var(--text-mute)]">
                {description}
              </p>
            )}
          </div>
          {action}
        </header>
      )}
      {children}
    </section>
  );
}
