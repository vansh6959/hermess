"use client";

import Link from "next/link";
import { Play, Pause } from "lucide-react";
import type { Artwork } from "@/lib/catalog/types";
import { cn } from "@/lib/utils";
import { ArtworkImage } from "./ArtworkImage";

interface LiquidArtworkCardProps {
  artwork: Artwork;
  title: string;
  subtitle?: string;
  eyebrow?: string;
  href?: string;
  onPlay?: () => void;
  isPlaying?: boolean;
  round?: boolean;
  className?: string;
  priority?: boolean;
}

export function LiquidArtworkCard({
  artwork,
  title,
  subtitle,
  eyebrow,
  href,
  onPlay,
  isPlaying = false,
  round = false,
  className,
  priority = false,
}: LiquidArtworkCardProps) {
  const artworkBody = (
    <div
      className={cn(
        "artwork-shell artwork-hover group/card relative",
        round ? "aspect-square rounded-full" : "aspect-square",
      )}
    >
      <ArtworkImage
        artwork={artwork}
        alt={artwork.alt}
        loading={priority ? "eager" : "lazy"}
        priority={priority}
        sizes="(min-width: 640px) 184px, 164px"
        className="artwork-img"
      />
      <div className="pointer-events-none absolute inset-0 z-[2] bg-gradient-to-t from-black/45 via-black/5 to-transparent opacity-0 transition-opacity duration-500 group-hover/card:opacity-100" />
    </div>
  );

  const text = (
    <div className="mt-3 px-0.5">
      {eyebrow && (
        <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-mute)]">
          {eyebrow}
        </p>
      )}
      <h3 className="truncate text-[13px] font-medium tracking-tight text-white/80 transition-colors duration-300 group-hover:text-white">
        {title}
      </h3>
      {subtitle && (
        <p className="mt-0.5 truncate text-[11.5px] text-[var(--text-mute)]">
          {subtitle}
        </p>
      )}
    </div>
  );

  return (
    <div className={cn("group block", className)}>
      <div className="relative">
        {href ? (
          <Link
            href={href}
            className="block rounded-2xl outline-offset-4"
            aria-label={`${title}${subtitle ? ` — ${subtitle}` : ""}`}
          >
            {artworkBody}
          </Link>
        ) : (
          artworkBody
        )}
        {onPlay && (
          <button
            type="button"
            aria-label={isPlaying ? `Pause ${title}` : `Play ${title}`}
            onClick={onPlay}
            className={cn(
              "play-btn play-btn--sm absolute bottom-3 right-3 z-10 translate-y-2 opacity-0 shadow-xl transition-all duration-300 ease-spring group-hover:translate-y-0 group-hover:opacity-100 focus-visible:translate-y-0 focus-visible:opacity-100",
              isPlaying && "translate-y-0 opacity-100",
            )}
          >
            {isPlaying ? (
              <Pause size={16} fill="currentColor" />
            ) : (
              <Play size={16} fill="currentColor" className="ml-0.5" />
            )}
          </button>
        )}
      </div>
      {href ? (
        <Link href={href} className="block outline-offset-4">
          {text}
        </Link>
      ) : (
        text
      )}
    </div>
  );
}
