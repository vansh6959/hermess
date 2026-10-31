"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function SectionRow({
  title,
  href,
  children,
  className,
  empty,
}: {
  title: string;
  href?: string;
  children: ReactNode;
  className?: string;
  empty?: boolean;
}) {
  if (empty) return null;
  return (
    <section className={cn("min-w-0", className)}>
      <div className="mb-5 flex items-center gap-3.5">
        <h2 className="shrink-0 text-[10px] font-medium uppercase tracking-[0.26em] text-[var(--text-mute)]">
          {title}
        </h2>
        <span
          className="h-px flex-1 bg-gradient-to-r from-white/[0.07] to-transparent"
          aria-hidden
        />
        {href && (
          <Link
            href={href}
            aria-label={`See all ${title}`}
            className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-white/25 transition hover:bg-white/[0.04] hover:text-white/70"
          >
            <ArrowUpRight size={13} />
          </Link>
        )}
      </div>
      <div className="no-scrollbar -mx-1 flex snap-x snap-mandatory gap-4 overflow-x-auto px-1 pb-2">
        {children}
      </div>
    </section>
  );
}
