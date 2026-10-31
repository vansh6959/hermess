"use client";

import {
  Maximize2,
  PictureInPicture2,
  SkipBack,
  SkipForward,
  X,
} from "lucide-react";
import { useSpotifyPlayback } from "@/components/providers/SpotifyPlaybackProvider";
import { ArtworkImage } from "@/components/ui/ArtworkImage";
import { LiquidTooltip } from "@/components/ui/LiquidTooltip";
import { SiriPlayButton } from "./SiriPlayButton";
import { useArtworkPalette, paletteStyle } from "@/lib/palette";
import { spotifyFallbackPalette } from "@/lib/spotify/artwork";
import { formatTime } from "@/lib/utils";

export function SpotifyPlayerBar() {
  const {
    current,
    active,
    isPlaying,
    positionMs,
    durationMs,
    volume,
    muted,
    togglePlay,
    next,
    previous,
    seek,
    closePlayer,
    openFullPlayer,
    minimizePlayer,
  } = useSpotifyPlayback();
  const palette = useArtworkPalette(
    current?.imageUrl ?? undefined,
    spotifyFallbackPalette,
  );

  if (!active || !current) return null;

  const safeDuration = Math.max(1, durationMs);
  const progress = Math.min(positionMs, safeDuration);

  return (
    <div
      className="spotify-bar-enter fixed inset-x-2.5 bottom-[calc(0.5rem+env(safe-area-inset-bottom))] z-40 sm:inset-x-5 sm:bottom-4"
      suppressHydrationWarning
      style={paletteStyle(palette)}
      role="region"
      aria-label="Now playing"
      data-testid="spotify-player-bar"
    >
      <div className="liquid spotify-dock rim grain relative overflow-hidden rounded-[20px] border-white/[0.12]">
        <div
          className="pointer-events-none absolute -left-16 top-1/2 h-40 w-72 -translate-y-1/2 rounded-full opacity-[0.14] blur-3xl"
          style={{ background: palette.a }}
          aria-hidden
        />
        <div className="relative flex h-[68px] items-center gap-3 px-3 lg:h-[88px] lg:px-5">
          <button
            type="button"
            onClick={openFullPlayer}
            className="artwork-shell player-artwork h-12 w-12 shrink-0 rounded-lg lg:h-14 lg:w-14"
            aria-label="Open full player"
          >
            <ArtworkImage
              artwork={{
                src: current.imageUrl ?? "",
                alt: current.albumName,
                palette,
              }}
              alt=""
              loading="eager"
            />
          </button>

          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-2">
              <button
                type="button"
                onClick={openFullPlayer}
                className="block min-h-6 max-w-full truncate py-0.5 text-left text-[12.5px] font-semibold tracking-tight text-white transition hover:underline underline-offset-4 decoration-white/30"
              >
                {current.name}
              </button>
            </div>
            <p className="mt-0.5 truncate text-[10.5px] text-[var(--text-mute)]">
              {current.artists}
              {current.albumName ? ` · ${current.albumName}` : ""}
            </p>
            <div className="mt-1 flex items-center gap-2 text-[9px] tabular-nums text-white/35">
              <span>{formatTime(Math.round(progress / 1000))}</span>
              <input
                type="range"
                min={0}
                max={safeDuration}
                step={1000}
                value={progress}
                onChange={(event) => void seek(Number(event.target.value))}
                className="range h-1 flex-1"
                aria-label="Seek in track"
                aria-valuetext={formatTime(Math.round(progress / 1000))}
              />
              <span className="hidden sm:inline">
                -{formatTime(Math.max(0, Math.round((durationMs - progress) / 1000)))}
              </span>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-0.5">
            <LiquidTooltip label="Previous">
              <button
                type="button"
                onClick={() => void previous()}
                className="icon-btn h-8 w-8"
                aria-label="Previous track"
              >
                <SkipBack size={14} fill="currentColor" />
              </button>
            </LiquidTooltip>
            <SiriPlayButton
              size="compact"
              playing={isPlaying}
              level={muted ? 0 : volume}
              trackId={current.id}
              className="mx-0.5"
              onToggle={() => void togglePlay()}
            />
            <LiquidTooltip label="Next">
              <button
                type="button"
                onClick={() => void next()}
                className="icon-btn h-8 w-8"
                aria-label="Next track"
              >
                <SkipForward size={14} fill="currentColor" />
              </button>
            </LiquidTooltip>
            <LiquidTooltip label="Float player">
              <button
                type="button"
                onClick={minimizePlayer}
                className="icon-btn ml-1 hidden h-8 w-8 lg:inline-flex"
                aria-label="Minimize player to a floating window"
              >
                <PictureInPicture2 size={14} />
              </button>
            </LiquidTooltip>
            <LiquidTooltip label="Open full player">
              <button
                type="button"
                onClick={openFullPlayer}
                className="icon-btn h-8 w-8"
                aria-label="Open full player"
              >
                <Maximize2 size={14} />
              </button>
            </LiquidTooltip>
            <LiquidTooltip label="Close player">
              <button
                type="button"
                onClick={closePlayer}
                className="icon-btn h-8 w-8"
                aria-label="Close player"
              >
                <X size={14} />
              </button>
            </LiquidTooltip>
          </div>
        </div>
      </div>
    </div>
  );
}
