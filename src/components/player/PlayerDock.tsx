"use client";

import Link from "next/link";
import {
  Expand,
  ListMusic,
  Maximize2,
  PictureInPicture2,
  Play,
  SkipForward,
  Pause,
} from "lucide-react";
import { catalog } from "@/lib/catalog";
import { usePlayerStore } from "@/store/player";
import { useArtworkPalette, paletteStyle } from "@/lib/palette";
import { ArtworkImage } from "@/components/ui/ArtworkImage";
import { LiquidTooltip } from "@/components/ui/LiquidTooltip";
import { LikeButton } from "./LikeButton";
import { SeekBar } from "./SeekBar";
import { Transport } from "./Transport";
import { VolumeControl } from "./VolumeControl";

export function PlayerDock() {
  const mode = usePlayerStore((state) => state.playerMode);
  const isNowPlayingOpen = usePlayerStore((state) => state.isNowPlayingOpen);
  const trackId = usePlayerStore((state) => state.currentTrackId);
  const queueIds = usePlayerStore((state) => state.queueIds);
  const currentIndex = usePlayerStore((state) => state.currentIndex);
  const status = usePlayerStore((state) => state.status);
  const openNowPlaying = usePlayerStore((state) => state.openNowPlaying);
  const minimizeNowPlaying = usePlayerStore((state) => state.minimizeNowPlaying);
  const toggleQueue = usePlayerStore((state) => state.toggleQueue);
  const togglePlay = usePlayerStore((state) => state.togglePlay);
  const next = usePlayerStore((state) => state.next);

  const track = trackId ? catalog.getTrack(trackId) : undefined;
  const artist = track ? catalog.getArtist(track.artistId) : undefined;
  const palette = useArtworkPalette(
    track?.artwork.src,
    track?.artwork.palette ?? { a: "#7fa8a6", b: "#d7e2d8", c: "#20363c" },
  );

  if (mode === "floating" || isNowPlayingOpen) return null;

  if (!track) {
    return (
      <div className="fixed inset-x-2.5 bottom-[calc(0.5rem+env(safe-area-inset-bottom))] z-40 sm:inset-x-5 sm:bottom-4">
        <div className="liquid rim flex h-[68px] items-center justify-between gap-4 rounded-[20px] border-white/[0.12] px-4 lg:h-[88px] lg:px-5">
          <p className="text-[12px] text-[var(--text-mute)]">
            Nothing playing. Pick a track to start the demo player.
          </p>
          <Link href="/discover" className="btn btn-accent h-8 px-3 text-[11px]">
            Browse music
          </Link>
        </div>
      </div>
    );
  }

  const remaining = Math.max(0, queueIds.length - currentIndex - 1);

  return (
    <div
      className="fixed inset-x-2.5 bottom-[calc(0.5rem+env(safe-area-inset-bottom))] z-40 sm:inset-x-5 sm:bottom-4"
      suppressHydrationWarning
      style={paletteStyle(palette)}
      role="region"
      aria-label="Player"
    >
      <div className="liquid rim grain relative overflow-hidden rounded-[20px] border-white/[0.12] lg:h-[88px]">
        <div
          className="pointer-events-none absolute -left-16 top-1/2 h-40 w-72 -translate-y-1/2 rounded-full opacity-[0.08] blur-3xl"
          style={{ background: palette.a }}
          aria-hidden
        />

        <div className="relative flex h-[68px] items-center gap-3 px-3 lg:grid lg:h-full lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)_minmax(0,0.85fr)] lg:items-center lg:gap-6 lg:px-6">
          {/* Track */}
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <button
              type="button"
              onClick={openNowPlaying}
              className="artwork-shell player-artwork h-11 w-11 shrink-0 rounded-lg lg:h-[58px] lg:w-[58px] lg:rounded-xl"
              aria-label="Open now playing"
            >
              <ArtworkImage
                artwork={track.artwork}
                alt=""
                loading="eager"
                sizes="58px"
              />
            </button>
            <div className="min-w-0">
              <button
                type="button"
                onClick={openNowPlaying}
                className="block min-h-6 max-w-full truncate py-1 text-left text-[13px] font-semibold tracking-tight text-white transition hover:underline underline-offset-4 decoration-white/30"
              >
                {track.title}
              </button>
              <Link
                href={`/artist/${track.artistId}`}
                className="mt-0.5 block min-h-6 truncate py-1 text-[11.5px] text-[var(--text-mute)] transition hover:text-white hover:underline underline-offset-4"
              >
                {artist?.name ?? "Unknown artist"}
              </Link>
            </div>
            <div className="hidden lg:block">
              <LikeButton size={16} className="h-8 w-8" />
            </div>
          </div>

          {/* Center controls */}
          <div className="hidden min-w-0 flex-col items-center lg:flex">
            <Transport size="sm" showShuffle showRepeat className="gap-2" />
            <SeekBar className="mt-1 w-full max-w-[560px]" compact />
          </div>

          {/* Right utilities */}
          <div className="hidden items-center justify-end gap-1.5 lg:flex">
            <VolumeControl />
            <LiquidTooltip label="Queue">
              <button
                type="button"
                onClick={() => toggleQueue(true)}
                className="icon-btn relative h-9 w-9"
                aria-label={`Open queue, ${remaining} upcoming`}
              >
                <ListMusic size={17} />
                {remaining > 0 && (
                  <span className="absolute right-0 top-0 grid h-3.5 min-w-3.5 place-items-center rounded-full bg-[var(--acid)] px-0.5 text-[8px] font-bold text-[#10140a]">
                    {remaining}
                  </span>
                )}
              </button>
            </LiquidTooltip>
            <LiquidTooltip label="Float player">
              <button
                type="button"
                onClick={minimizeNowPlaying}
                className="icon-btn h-9 w-9"
                aria-label="Minimize player into a floating window"
              >
                <PictureInPicture2 size={17} />
              </button>
            </LiquidTooltip>
            <LiquidTooltip label="Open full player">
              <button
                type="button"
                onClick={openNowPlaying}
                className="icon-btn h-9 w-9"
                aria-label="Open full player"
              >
                <Maximize2 size={17} />
              </button>
            </LiquidTooltip>
          </div>

          {/* Mobile controls */}
          <div className="flex items-center gap-1 lg:hidden">
            <button
              type="button"
              onClick={togglePlay}
              className="play-btn play-btn--sm h-9 w-9"
              aria-label={status === "playing" ? "Pause" : "Play"}
            >
              {status === "playing" ? (
                <Pause size={14} fill="currentColor" />
              ) : (
                <Play size={14} fill="currentColor" className="ml-0.5" />
              )}
            </button>
            <button
              type="button"
              onClick={next}
              className="icon-btn h-8 w-8"
              aria-label="Next track"
            >
              <SkipForward size={15} fill="currentColor" />
            </button>
            <button
              type="button"
              onClick={openNowPlaying}
              className="icon-btn h-8 w-8"
              aria-label="Open full player"
            >
              <Expand size={15} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
