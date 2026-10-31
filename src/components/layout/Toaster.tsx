"use client";

import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";
import { useToastStore } from "@/store/toast";
import { cn } from "@/lib/utils";

export function Toaster() {
  const toasts = useToastStore((state) => state.toasts);
  const dismiss = useToastStore((state) => state.dismiss);

  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-[calc(6.5rem+env(safe-area-inset-bottom))] z-[100] flex flex-col items-center gap-2 px-4 lg:bottom-[116px]"
      aria-live="polite"
      aria-atomic="false"
    >
      {toasts.map((item) => (
        <div
          key={item.id}
          className={cn(
            "liquid-raised rim pointer-events-auto flex w-full max-w-sm items-center gap-2.5 rounded-2xl px-4 py-3 shadow-2xl animate-fade-up",
          )}
        >
          {item.tone === "success" ? (
            <CheckCircle2 size={15} className="shrink-0 text-[var(--acid)]" />
          ) : item.tone === "error" ? (
            <AlertCircle size={15} className="shrink-0 text-[var(--danger)]" />
          ) : (
            <Info size={15} className="shrink-0 text-[var(--mint)]" />
          )}
          <p className="flex-1 text-[12.5px] leading-snug text-white">{item.message}</p>
          <button
            type="button"
            onClick={() => dismiss(item.id)}
            className="grid h-5 w-5 place-items-center rounded-full text-white/40 transition hover:bg-white/10 hover:text-white"
            aria-label="Dismiss notification"
          >
            <X size={12} />
          </button>
        </div>
      ))}
    </div>
  );
}
