"use client";

import { useRouter } from "next/navigation";
import {
  Heart,
  ListPlus,
  MoreHorizontal,
  Pause,
  Play,
  Plus,
  Disc3,
  User,
} from "lucide-react";
import type { Track } from "@/lib/catalog/types";
import { catalog } from "@/lib/catalog";
import { cn, formatTime } from "@/lib/utils";
import { usePlayerStore } from "@/store/player";
import { useLibraryStore } from "@/store/library";
import { toast } from "@/store/toast";
import { LiquidDropdown } from "./LiquidDropdown";
import { ArtworkImage } from "./ArtworkImage";

interface LiquidTrackRowProps {
  track: Track;
  index: number;
  queueIds?: string[];
  contextLabel?: string;
  showAlbum?: boolean;
  showArtwork?: boolean;
  onRemove?: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  className?: string;
}

function Equalizer() {
  return (
    <span className="flex h-3.5 items-end gap-[2px]" aria-hidden>
      <span className="eq-bar h-2" />
      <span className="eq-bar h-3.5" />
      <span className="eq-bar h-2.5" />
    </span>
  );
}

export function LiquidTrackRow({
  track,
  index,
  queueIds,
  contextLabel,
  showAlbum = true,
  showArtwork = false,
  onRemove,
  onMoveUp,
  onMoveDown,
  className,
}: LiquidTrackRowProps) {
  const router = useRouter();
  const currentTrackId = usePlayerStore((state) => state.currentTrackId);
  const status = usePlayerStore((state) => state.status);
  const playTrack = usePlayerStore((state) => state.playTrack);
  const togglePlay = usePlayerStore((state) => state.togglePlay);
  const addToQueue = usePlayerStore((state) => state.addToQueue);
  const playNextAction = usePlayerStore((state) => state.playNext);
  const liked = useLibraryStore((state) => state.likedTrackIds.includes(track.id));
  const toggleLike = useLibraryStore((state) => state.toggleLike);

  const isCurrent = currentTrackId === track.id;
  const isPlaying = isCurrent && status === "playing";
  const artist = catalog.getArtist(track.artistId);
  const album = catalog.getAlbum(track.albumId);

  const play = () => {
    if (isCurrent) {
      togglePlay();
      return;
    }
    playTrack(track.id, queueIds, contextLabel);
  };

  const onLike = () => {
    const added = toggleLike(track.id);
    toast(added ? "Added to Liked Songs" : "Removed from Liked Songs", "success");
  };

  return (
    <div
      className={cn(
        "group/row grid grid-cols-[24px_minmax(0,1fr)_auto] items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-white/[0.045] sm:gap-4",
        !showArtwork &&
          showAlbum &&
          "sm:grid-cols-[26px_minmax(0,1fr)_minmax(0,0.8fr)_auto]",
        showArtwork &&
          !showAlbum &&
          "sm:grid-cols-[26px_40px_minmax(0,1fr)_auto]",
        showArtwork &&
          showAlbum &&
          "sm:grid-cols-[26px_40px_minmax(0,1fr)_minmax(0,0.7fr)_auto]",
        isCurrent && "bg-white/[0.035]",
        className,
      )}
    >
      <div className="flex items-center justify-center">
        <button
          type="button"
          onClick={play}
          aria-label={
            isPlaying ? `Pause ${track.title}` : `Play ${track.title}`
          }
          className="grid h-6 w-6 place-items-center rounded-md text-[11px] tabular-nums text-[var(--text-mute)] transition hover:text-white"
        >
          <span className={cn("group-hover/row:hidden", isCurrent && "hidden")}>
            {index + 1}
          </span>
          {isPlaying ? (
            <span className="block group-hover/row:hidden">
              <Equalizer />
            </span>
          ) : null}
          {isCurrent && !isPlaying ? (
            <span className="hidden group-hover/row:block">
              <Play size={11} fill="currentColor" />
            </span>
          ) : (
            <span className="hidden group-hover/row:block">
              {isPlaying ? (
                <Pause size={11} fill="currentColor" />
              ) : (
                <Play size={12} fill="currentColor" />
              )}
            </span>
          )}
        </button>
      </div>

      {showArtwork && (
        <button
          type="button"
          onClick={play}
          className="artwork-shell hidden h-10 w-10 shrink-0 sm:block"
          aria-label={`Play ${track.title}`}
        >
          <ArtworkImage
            artwork={track.artwork}
            alt=""
            loading="lazy"
            sizes="40px"
          />
        </button>
      )}

      <div className="min-w-0">
        <button
          type="button"
          onClick={play}
          className="block max-w-full truncate text-left text-[13px] font-medium tracking-tight text-white transition hover:underline decoration-white/30 underline-offset-4"
        >
          {track.title}
        </button>
        <div className="mt-0.5 flex items-center gap-1.5 text-[11.5px] text-[var(--text-mute)]">
          <button
            type="button"
            onClick={() => router.push(`/artist/${track.artistId}`)}
            className="truncate transition hover:text-white hover:underline underline-offset-4"
          >
            {artist?.name ?? "Unknown artist"}
          </button>
          {track.explicit && (
            <span className="grid h-3.5 w-3.5 shrink-0 place-items-center rounded-[3px] border border-white/20 text-[8px] leading-none text-white/50">
              E
            </span>
          )}
        </div>
      </div>

      {showAlbum && (
        <button
          type="button"
          onClick={() => album && router.push(`/album/${album.id}`)}
          className="hidden truncate text-left text-[12px] text-[var(--text-mute)] transition hover:text-white sm:block"
        >
          {album?.title ?? "Single"}
        </button>
      )}

      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={onLike}
          aria-label={liked ? "Remove from Liked Songs" : "Add to Liked Songs"}
          aria-pressed={liked}
          className={cn(
            "icon-btn h-8 w-8 opacity-0 focus-visible:opacity-100 group-hover/row:opacity-100",
            liked && "opacity-100",
          )}
        >
          <Heart
            size={14}
            className={liked ? "text-[var(--acid)]" : ""}
            fill={liked ? "currentColor" : "none"}
          />
        </button>
        <span className="w-10 text-right text-[11.5px] tabular-nums text-[var(--text-mute)]">
          {formatTime(track.duration)}
        </span>
        <LiquidDropdown
          trigger={
            <button
              type="button"
              className="icon-btn h-8 w-8 opacity-0 focus-visible:opacity-100 group-hover/row:opacity-100"
              aria-label={`More options for ${track.title}`}
            >
              <MoreHorizontal size={15} />
            </button>
          }
          items={[
            {
              label: "Play now",
              icon: <Play size={13} />,
              onSelect: play,
            },
            {
              label: "Play next",
              icon: <ListPlus size={13} />,
              onSelect: () => {
                playNextAction(track.id);
                toast("Playing next", "success");
              },
            },
            {
              label: "Add to queue",
              icon: <Plus size={13} />,
              onSelect: () => {
                addToQueue(track.id);
                toast("Added to queue", "success");
              },
            },
            {
              label: liked ? "Remove from Liked Songs" : "Add to Liked Songs",
              icon: <Heart size={13} />,
              onSelect: onLike,
              separatorBefore: true,
            },
            {
              label: "Go to album",
              icon: <Disc3 size={13} />,
              onSelect: () => album && router.push(`/album/${album.id}`),
            },
            {
              label: "Go to artist",
              icon: <User size={13} />,
              onSelect: () => router.push(`/artist/${track.artistId}`),
            },
            ...(onMoveUp || onMoveDown || onRemove
              ? [
                  {
                    label: "Move up",
                    onSelect: onMoveUp ?? (() => {}),
                    disabled: !onMoveUp,
                    separatorBefore: true,
                  },
                  {
                    label: "Move down",
                    onSelect: onMoveDown ?? (() => {}),
                    disabled: !onMoveDown,
                  },
                  {
                    label: "Remove from playlist",
                    onSelect: onRemove ?? (() => {}),
                    danger: true,
                    disabled: !onRemove,
                  },
                ]
              : []),
          ]}
        />
      </div>
    </div>
  );
}
