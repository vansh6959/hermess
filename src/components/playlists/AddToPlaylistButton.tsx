"use client";

import { ListMusic } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PlaylistTrack } from "@/lib/spotify/playlist-types";
import { usePlaylistDialogStore } from "@/store/playlist-dialog";

export function AddToPlaylistButton({
  track,
  className,
  onOpen,
}: {
  track: PlaylistTrack;
  className?: string;
  onOpen?: () => void;
}) {
  const open = usePlaylistDialogStore((state) => state.open);
  return (
    <button
      type="button"
      onClick={() => {
        onOpen?.();
        open(track);
      }}
      aria-label={`Add ${track.name} by ${track.artists} to playlist`}
      className={cn(
        "grid h-7 w-7 shrink-0 place-items-center rounded-full text-white/40 transition hover:bg-white/10 hover:text-[#8df0ad]",
        className,
      )}
    >
      <ListMusic size={14} aria-hidden />
    </button>
  );
}
