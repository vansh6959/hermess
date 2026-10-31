"use client";

import { Heart } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLibraryStore } from "@/store/library";
import { usePlayerStore } from "@/store/player";
import { toast } from "@/store/toast";
import { LiquidTooltip } from "@/components/ui/LiquidTooltip";

export function LikeButton({
  trackId,
  size = 18,
  className,
  label = true,
}: {
  trackId?: string;
  size?: number;
  className?: string;
  label?: boolean;
}) {
  const currentTrackId = usePlayerStore((state) => state.currentTrackId);
  const targetId = trackId ?? currentTrackId;
  const liked = useLibraryStore((state) =>
    targetId ? state.likedTrackIds.includes(targetId) : false,
  );
  const toggleLike = useLibraryStore((state) => state.toggleLike);

  if (!targetId) return null;

  const button = (
    <button
      type="button"
      aria-pressed={liked}
      aria-label={liked ? "Remove from Liked Songs" : "Add to Liked Songs"}
      onClick={() => {
        const added = toggleLike(targetId);
        toast(added ? "Added to Liked Songs" : "Removed from Liked Songs", "success");
      }}
      className={cn("icon-btn", liked && "!text-[var(--acid)]", className)}
    >
      <Heart
        size={size}
        fill={liked ? "currentColor" : "none"}
        className={cn("transition-transform duration-200 ease-spring", liked && "scale-110")}
      />
    </button>
  );

  return label ? (
    <LiquidTooltip label={liked ? "Remove from Liked Songs" : "Add to Liked Songs"}>
      {button}
    </LiquidTooltip>
  ) : (
    button
  );
}
