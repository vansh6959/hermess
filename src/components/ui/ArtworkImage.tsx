"use client";

import { useState } from "react";
import { Music2 } from "lucide-react";
import type { Artwork } from "@/lib/catalog/types";
import { cn } from "@/lib/utils";
import {
  isLocalArtwork,
  localArtworkSrcSet,
  localArtworkVariant,
} from "@/lib/artwork-variants";

interface ArtworkImageProps {
  artwork?: Artwork;
  alt?: string;
  className?: string;
  imgClassName?: string;
  sizes?: string;
  loading?: "eager" | "lazy";
  priority?: boolean;
}

export function ArtworkImage({
  artwork,
  alt,
  className,
  imgClassName,
  sizes = "320px",
  loading = "lazy",
  priority = false,
}: ArtworkImageProps) {
  const [failed, setFailed] = useState(false);
  const label = alt ?? artwork?.alt ?? "Artwork";

  if (!artwork?.src || failed) {
    return (
      <div
        role="img"
        aria-label={label}
        className={cn(
          "grid h-full w-full place-items-center",
          "bg-[radial-gradient(circle_at_30%_20%,var(--fallback-a,#3b4a4d),var(--fallback-c,#0a0d11)_70%)]",
          className,
        )}
        style={
          artwork
            ? ({
                "--fallback-a": artwork.palette.a,
                "--fallback-c": artwork.palette.c,
              } as React.CSSProperties)
            : undefined
        }
      >
        <Music2 size={28} className="text-white/30" aria-hidden />
      </div>
    );
  }

  const eager = priority || loading === "eager";
  const local = isLocalArtwork(artwork.src) ? artwork.src : null;

  return (
    <picture className="block h-full w-full">
      {local ? (
        <>
          <source
            type="image/avif"
            srcSet={localArtworkSrcSet(local, "avif")}
            sizes={sizes}
          />
          <source
            type="image/webp"
            srcSet={localArtworkSrcSet(local, "webp")}
            sizes={sizes}
          />
        </>
      ) : null}
      <img
        src={local ? localArtworkVariant(local, 1024, "webp") : artwork.src}
        alt={label}
        loading={eager ? "eager" : "lazy"}
        fetchPriority={priority ? "high" : undefined}
        decoding="async"
        draggable={false}
        width={local ? 1024 : undefined}
        height={local ? 1024 : undefined}
        onError={() => setFailed(true)}
        className={cn("h-full w-full object-cover", className, imgClassName)}
      />
    </picture>
  );
}
