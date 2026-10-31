"use client";

import { forwardRef, useState, type ReactNode } from "react";
import type { InputHTMLAttributes } from "react";
import { Loader2, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface LiquidInputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
  error?: string;
}

export const LiquidInput = forwardRef<HTMLInputElement, LiquidInputProps>(
  function LiquidInput({ className, label, hint, error, id, ...props }, ref) {
    const inputId = id ?? props.name;
    return (
      <label className="block" htmlFor={inputId}>
        {label && (
          <span className="mb-2 block text-[12px] font-medium text-[var(--text-dim)]">
            {label}
          </span>
        )}
        <input
          ref={ref}
          id={inputId}
          className={cn("input", error && "border-[var(--danger)]", className)}
          aria-invalid={Boolean(error)}
          {...props}
        />
        {(error || hint) && (
          <span
            className={cn(
              "mt-1.5 block text-[11.5px]",
              error ? "text-[var(--danger)]" : "text-[var(--text-mute)]",
            )}
          >
            {error ?? hint}
          </span>
        )}
      </label>
    );
  },
);

interface LiquidSearchProps extends InputHTMLAttributes<HTMLInputElement> {
  onClear?: () => void;
  containerClassName?: string;
  autoFocus?: boolean;
  loading?: boolean;
  trailing?: ReactNode;
}

export const LiquidSearch = forwardRef<HTMLInputElement, LiquidSearchProps>(
  function LiquidSearch(
    {
      className,
      containerClassName,
      onClear,
      value,
      autoFocus,
      loading = false,
      onChange,
      trailing,
      ...props
    },
    ref,
  ) {
    const [localValue, setLocalValue] = useState("");
    const currentValue = value ?? localValue;
    return (
      <div className={cn("search-shell group/search relative", containerClassName)}>
        <div
          aria-hidden
          className="search-border-glow pointer-events-none absolute -inset-px rounded-[23px] opacity-70 transition-opacity duration-500 group-focus-within/search:opacity-100"
        />
        <div className="relative flex h-[56px] items-center gap-3 overflow-hidden rounded-[22px] border border-white/[0.04] bg-[rgba(7,10,10,0.8)] px-3 shadow-[0_18px_44px_-30px_rgba(0,0,0,0.95),inset_0_1px_0_rgba(255,255,255,0.05)] backdrop-blur-xl transition-[box-shadow,border-color] duration-300 group-focus-within/search:border-transparent group-focus-within/search:shadow-[0_22px_60px_-28px_rgba(143,185,163,0.32),inset_0_1px_0_rgba(255,255,255,0.08)]">
          <span
            aria-hidden
            className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-white/25 to-transparent"
          />
          <span
            aria-hidden
            className="search-beam pointer-events-none absolute left-[18%] right-[18%] top-0 h-px"
          />
          <span className="relative grid h-9 w-9 shrink-0 place-items-center rounded-[12px] border border-white/[0.08] bg-[linear-gradient(145deg,rgba(143,185,163,0.16),rgba(255,255,255,0.02))] text-[var(--mint)] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
            <Search size={16} aria-hidden />
          </span>
          <input
            ref={ref}
            autoFocus={autoFocus}
            value={value}
            onChange={(event) => {
              if (value === undefined) setLocalValue(event.target.value);
              onChange?.(event);
            }}
            className={cn(
              "peer h-full w-full border-0 bg-transparent text-[15px] tracking-[-0.01em] text-white outline-none placeholder:text-[var(--text-mute)] focus-visible:outline-none",
              className,
            )}
            {...props}
          />
          {loading && (
            <Loader2
              size={14}
              className="shrink-0 animate-spin text-[var(--acid)]"
              aria-hidden
            />
          )}
          {!loading && String(currentValue).length > 0 && onClear && (
            <button
              type="button"
              onClick={onClear}
              aria-label="Clear search"
              className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-[var(--text-mute)] transition hover:bg-white/10 hover:text-white"
            >
              <X size={13} />
            </button>
          )}
          {trailing}
        </div>
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-10 -bottom-2 h-4 rounded-full bg-[radial-gradient(ellipse_at_center,rgba(143,185,163,0.28),transparent_70%)] opacity-0 blur-[6px] transition-opacity duration-500 group-focus-within/search:opacity-100"
        />
      </div>
    );
  },
);
