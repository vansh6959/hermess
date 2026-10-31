"use client";

import { ListMusic } from "lucide-react";
import type { LibraryCollection } from "@/lib/library/collections";
import { ArtworkImage } from "@/components/ui/ArtworkImage";
import { toSpotifyArtwork } from "@/lib/spotify/artwork";
import { cn, initials } from "@/lib/utils";

const SIZES = {
  row: "h-10 w-10 rounded-[10px]",
  album: "h-11 w-11 rounded-[11px]",
} as const;

export function LibraryArtwork({
  collection,
  size = "row",
  className,
}: {
  collection: LibraryCollection;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const shape = SIZES[size];

  if (collection.kind === "artist") {
    if (collection.imageUrl) {
      return (
        <span className={cn("artwork-shell shrink-0", shape, className)}>
          <ArtworkImage
            artwork={toSpotifyArtwork(collection.imageUrl, collection.name)}
            alt=""
            loading="lazy"
            sizes="64px"
            className="artwork-img"
          />
        </span>
      );
    }
    return (
      <span
        aria-hidden
        className={cn(
          "grid shrink-0 place-items-center border border-white/[0.09] bg-[linear-gradient(155deg,rgba(191,227,205,0.2),rgba(42,58,51,0.42))] text-[10px] font-semibold tracking-wide text-white/75",
          shape,
          className,
        )}
      >
        {initials(collection.name)}
      </span>
    );
  }

  if (collection.imageUrl) {
    return (
      <span className={cn("artwork-shell shrink-0", shape, className)}>
        <ArtworkImage
          artwork={toSpotifyArtwork(collection.imageUrl, collection.name)}
          alt=""
          loading="lazy"
          sizes="64px"
          className="artwork-img"
        />
      </span>
    );
  }

  if (collection.mosaic.length > 0) {
    return (
      <span
        aria-hidden
        className={cn(
          "artwork-shell grid shrink-0 grid-cols-2 grid-rows-2 overflow-hidden bg-[#080b0b]",
          shape,
          className,
        )}
      >
        {collection.mosaic.slice(0, 4).map((src, index) => {
          const count = Math.min(collection.mosaic.length, 4);
          const layout =
            count === 1
              ? "col-span-2 row-span-2"
              : count === 2
                ? "col-span-1 row-span-2"
                : count === 3
                  ? index === 0
                    ? "col-span-1 row-span-2"
                    : "col-span-1 row-span-1"
                  : "col-span-1 row-span-1";
          return (
            <span key={`${src}-${index}`} className={cn("relative block", layout)}>
              <ArtworkImage
                artwork={toSpotifyArtwork(src, collection.name)}
                alt=""
                loading="lazy"
                sizes="32px"
                className="h-full w-full object-cover"
                imgClassName="h-full w-full object-cover"
              />
            </span>
          );
        })}
      </span>
    );
  }

  return (
    <span
      aria-hidden
      className={cn(
        "grid shrink-0 place-items-center border border-white/[0.07] bg-[radial-gradient(circle_at_30%_20%,rgba(191,227,205,0.16),rgba(8,11,11,0.9)_72%)] text-white/35",
        shape,
        className,
      )}
    >
      <ListMusic size={15} />
    </span>
  );
}
