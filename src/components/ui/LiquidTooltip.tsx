import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function LiquidTooltip({
  label,
  children,
  side = "top",
  className,
}: {
  label: string;
  children: ReactNode;
  side?: "top" | "bottom";
  className?: string;
}) {
  return (
    <span
      className={cn("tip", side === "bottom" && "tip-bottom", className)}
      data-tip={label}
    >
      {children}
    </span>
  );
}
