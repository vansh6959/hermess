"use client";

import { cn } from "@/lib/utils";

interface LiquidToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
}

export function LiquidToggle({
  checked,
  onChange,
  label,
  description,
  disabled,
}: LiquidToggleProps) {
  return (
    <div className="flex items-center justify-between gap-5 py-3">
      <div>
        <p className="text-[13.5px] font-medium text-white">{label}</p>
        {description && (
          <p className="mt-0.5 text-[12px] leading-relaxed text-[var(--text-mute)]">
            {description}
          </p>
        )}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative h-6 w-11 shrink-0 rounded-full border transition-colors duration-200 disabled:opacity-40",
          checked
            ? "border-[rgba(215,247,106,0.5)] bg-[rgba(215,247,106,0.9)]"
            : "border-white/10 bg-white/10",
        )}
      >
        <span
          className={cn(
            "absolute top-1/2 h-4 w-4 -translate-y-1/2 rounded-full shadow-sm transition-all duration-200 ease-spring",
            checked ? "left-[24px] bg-[#10140a]" : "left-[4px] bg-white/80",
          )}
        />
      </button>
    </div>
  );
}
