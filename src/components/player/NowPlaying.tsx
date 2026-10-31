"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ChevronDown,
  ListMusic,
  Maximize2,
  Minimize2,
  PictureInPicture2,
  Quote,
} from "lucide-react";
import { catalog } from "@/lib/catalog";
import { usePlayerStore } from "@/store/player";
import { useArtworkPalette, paletteStyle } from "@/lib/palette";
import { artworkBackground } from "@/lib/artwork-variants";
import { cn } from "@/lib/utils";
import { ArtworkImage } from "@/components/ui/ArtworkImage";
import { LiquidTooltip } from "@/components/ui/LiquidTooltip";
import { LikeButton } from "./LikeButton";
import { SeekBar } from "./SeekBar";
import { Transport } from "./Transport";
import { VolumeControl } from "./VolumeControl";
import { LyricsPanel } from "./LyricsPanel";

const fallbackPalette = { a: "#7fa8a6", b: "#d7e2d8", c: "#20363c" };

export function NowPlaying() {
  const open = usePlayerStore((state) => state.isNowPlayingOpen);
  const trackId = usePlayerStore((state) => state.currentTrackId);
  const queueIds = usePlayerStore((state) => state.queueIds);
  const currentIndex = usePlayerStore((state) => state.currentIndex);
  const lyricsVisible = usePlayerStore((state) => state.lyricsVisible);
  const closeNowPlaying = usePlayerStore((state) => state.closeNowPlaying);
  const minimizeNowPlaying = usePlayerStore((state) => state.minimizeNowPlaying);
  const toggleLyrics = usePlayerStore((state) => state.toggleLyrics);
  const toggleQueue = usePlayerStore((state) => state.toggleQueue);

  const track = trackId ? catalog.getTrack(trackId) : undefined;
  const artist = track ? catalog.getArtist(track.artistId) : undefined;
  const album = track ? catalog.getAlbum(track.albumId) : undefined;

  const palette = useArtworkPalette(
    track?.artwork.src,
    track?.artwork.palette ?? fallbackPalette,
  );

  const panelRef = useRef<HTMLDivElement>(null);
  const [isBrowserFullscreen, setIsBrowserFullscreen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const timer = window.setTimeout(() => panelRef.current?.focus(), 40);
    const onFullscreenChange = () =>
      setIsBrowserFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.clearTimeout(timer);
      document.removeEventListener("fullscreenchange", onFullscreenChange);
    };
  }, [open]);

  useEffect(() => {
    if (!open && typeof document !== "undefined" && document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }
  }, [open]);

  if (!open || !track) return null;

  const remaining = Math.max(0, queueIds.length - currentIndex - 1);

  const exitBrowserFullscreen = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }
  };

  const toggleBrowserFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch {
      // Browser may reject fullscreen without a direct gesture; the overlay
      // itself remains fully usable.
    }
  };

  const minimize = () => {
    exitBrowserFullscreen();
    minimizeNowPlaying();
  };

  const close = () => {
    exitBrowserFullscreen();
    closeNowPlaying();
  };

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="now-playing-title"
      tabIndex={-1}
      className="fixed inset-0 z-[70] overflow-hidden bg-[#040506] outline-none animate-fade-in"
      suppressHydrationWarning
      style={paletteStyle(palette)}
    >
      {/* Adaptive backdrop */}
      <div className="absolute inset-0" aria-hidden>
        <div
          className="np-bg"
          style={{ backgroundImage: artworkBackground(track.artwork.src, 640) }}
        />
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: `radial-gradient(85% 70% at 12% 8%, ${palette.a}33, transparent 62%), radial-gradient(65% 75% at 88% 82%, ${palette.b}22, transparent 64%), linear-gradient(180deg, rgba(4,5,6,0.18) 0%, rgba(4,5,6,0.58) 58%, rgba(4,5,6,0.92) 100%)`,
          }}
        />
        <div
          className="absolute -left-[12%] top-[8%] h-[46vw] w-[46vw] rounded-full opacity-25 blur-[110px]"
          style={{ background: palette.a }}
        />
        <div
          className="absolute -bottom-[18%] right-[-8%] h-[42vw] w-[42vw] rounded-full opacity-20 blur-[120px]"
          style={{ background: palette.c }}
        />
        <div className="np-noise" />
        <div className="absolute inset-0 bg-[radial-gradient(130%_100%_at_50%_40%,transparent_38%,rgba(2,3,3,0.82)_100%)]" />
      </div>

      <div className="relative z-10 flex h-full flex-col">
        <header className="flex shrink-0 items-center justify-end gap-3 px-4 py-4 sm:px-7 lg:px-10">
          <div className="flex items-center gap-1.5">
            <LiquidTooltip label={lyricsVisible ? "Hide lyrics" : "Show lyrics"} side="bottom">
              <button
                type="button"
                onClick={toggleLyrics}
                data-active={lyricsVisible}
                aria-pressed={lyricsVisible}
                aria-label={lyricsVisible ? "Hide lyrics" : "Show lyrics"}
                className="icon-btn h-9 w-9 bg-white/[0.04]"
              >
                <Quote size={16} />
              </button>
            </LiquidTooltip>

            <LiquidTooltip
              label={isBrowserFullscreen ? "Exit full screen" : "Full screen"}
              side="bottom"
            >
              <button
                type="button"
                onClick={toggleBrowserFullscreen}
                aria-label={isBrowserFullscreen ? "Exit full screen" : "Enter full screen"}
                className="icon-btn hidden h-9 w-9 bg-white/[0.04] sm:inline-flex"
              >
                {isBrowserFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
              </button>
            </LiquidTooltip>

            <button
              type="button"
              onClick={minimize}
              className="btn ml-1 h-9 gap-2 border-white/15 bg-white/[0.07] px-3 text-[11.5px] hover:bg-white/[0.12]"
              aria-label="Minimize player to a floating window"
            >
              <PictureInPicture2 size={15} />
              <span className="hidden sm:inline">Minimize</span>
            </button>

            <LiquidTooltip label="Close player" side="bottom">
              <button
                type="button"
                onClick={close}
                className="icon-btn ml-0.5 h-9 w-9 bg-white/[0.04]"
                aria-label="Close now playing and return to the app"
              >
                <ChevronDown size={19} />
              </button>
            </LiquidTooltip>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto">
          <div
            className={cn(
              "mx-auto flex min-h-full w-full flex-col gap-8 px-4 pb-10 sm:px-7 lg:grid lg:items-center lg:px-12 lg:pb-8",
              lyricsVisible
                ? "max-w-[1480px] lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)] lg:gap-14"
                : "lg:max-w-[760px] lg:grid-cols-1 lg:gap-0",
            )}
          >
            <section className="flex flex-col justify-center pt-2 lg:pt-0">
              <div className="relative mx-auto w-full max-w-[min(52vh,440px)] lg:max-w-[min(52vh,470px)]">
                <div
                  className="absolute -inset-10 -z-10 rounded-full opacity-45 blur-[70px]"
                  style={{
                    background: `radial-gradient(circle, ${palette.a}, transparent 68%)`,
                  }}
                  aria-hidden
                />
                <div className="blended-artwork player-artwork aspect-square">
                  <ArtworkImage
                    artwork={track.artwork}
                    alt={`${album?.title ?? track.title} artwork`}
                    loading="eager"
                    sizes="(min-width: 1024px) 470px, 440px"
                    className="artwork-img"
                  />
                </div>
              </div>

              <div className="mt-7 text-center">
                <div className="flex items-center justify-center gap-2 lg:justify-start">
                  {album && (
                    <Link
                      href={`/album/${album.id}`}
                      className="text-[10px] font-semibold uppercase tracking-[0.19em] text-white/55 transition hover:text-white"
                    >
                      {album.title}
                    </Link>
                  )}
                  <span className="h-1 w-1 rounded-full bg-white/25" />
                  <span className="text-[10px] font-medium uppercase tracking-[0.19em] text-white/40">
                    {album?.year ?? "Demo"}
                  </span>
                </div>

                <h1
                  id="now-playing-title"
                  className="mt-2.5 text-[2rem] font-semibold leading-[1.02] tracking-[-0.04em] text-white sm:text-[2.6rem] lg:text-[2.9rem] xl:text-[3.25rem]"
                >
                  {track.title}
                </h1>

                <div className="mt-2 flex items-center justify-center gap-2.5">
                  <Link
                    href={`/artist/${track.artistId}`}
                    className="text-[14.5px] font-medium text-white/80 transition hover:text-white hover:underline underline-offset-4 decoration-white/30"
                  >
                    {artist?.name ?? "Unknown artist"}
                  </Link>
                  {track.explicit && (
                    <span className="grid h-4 w-4 place-items-center rounded-[3px] border border-white/25 text-[8px] leading-none text-white/60">
                      E
                    </span>
                  )}
                  <span className="ml-1">
                    <LikeButton size={17} className="h-8 w-8" />
                  </span>
                </div>
              </div>

              <div className="mx-auto mt-6 w-full max-w-[560px]">
                <SeekBar />
                <Transport
                  size="lg"
                  showShuffle
                  showRepeat
                  alwaysShowModes
                  className="mt-1"
                />
                <div className="mt-4 flex items-center justify-between gap-4">
                  <button
                    type="button"
                    onClick={() => toggleQueue(true)}
                    className="btn h-9 px-3.5 text-[11.5px]"
                    aria-label="Open queue"
                  >
                    <ListMusic size={15} />
                    Queue
                    {remaining > 0 && (
                      <span className="rounded-full bg-white/10 px-1.5 py-0.5 text-[9.5px] tabular-nums text-white/70">
                        {remaining}
                      </span>
                    )}
                  </button>
                  <VolumeControl />
                </div>
              </div>
            </section>

            {lyricsVisible ? (
              <section className="mx-auto flex w-full max-w-[720px] min-h-0 flex-col pb-4 lg:h-[min(72vh,680px)] lg:border-l lg:border-white/[0.09] lg:pl-12">
                <LyricsPanel track={track} className="h-[54vh] min-h-[300px] lg:h-full" />
              </section>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
