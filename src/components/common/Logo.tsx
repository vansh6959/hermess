"use client";

import Link from "next/link";
import { BRAND } from "@/lib/brand";
import { cn } from "@/lib/utils";

export function Logo({
  collapsed = false,
  className,
  onClick,
}: {
  collapsed?: boolean;
  className?: string;
  onClick?: (event: React.MouseEvent<HTMLAnchorElement>) => void;
}) {
  return (
    <Link
      href="/"
      aria-label={`${BRAND.name} home`}
      onClick={onClick}
      className={cn("flex items-center gap-2.5", className)}
    >
      <span className="relative grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-[13px] border border-white/[0.16] bg-[linear-gradient(150deg,rgba(255,255,255,0.5),rgba(191,227,205,0.26)_38%,rgba(255,255,255,0.03))] shadow-[0_10px_34px_-16px_rgba(191,227,205,0.28)]">
        <span className="display-serif text-[21px] leading-none text-[#10140a]">h</span>
        <span className="absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/60 to-transparent opacity-60" />
      </span>
      {!collapsed && (
        <span className="display-serif text-[22px] leading-none tracking-tight text-white">
          {BRAND.wordmark}
        </span>
      )}
    </Link>
  );
}
