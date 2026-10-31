"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FocusEvent,
} from "react";
import {
  ChevronDown,
  ListMusic,
  Maximize2,
  Minimize2,
  PictureInPicture2,
  Quote,
  Shuffle,
  SkipBack,
  SkipForward,
} from "lucide-react";
import { useSpotifyPlayback } from "@/components/providers/SpotifyPlaybackProvider";
import { ArtworkImage } from "@/components/ui/ArtworkImage";
import { LiquidSlider } from "@/components/ui/LiquidSlider";
import { LiquidTooltip } from "@/components/ui/LiquidTooltip";
import { useAmbientMotion } from "@/hooks/useAmbientMotion";
import { useTrackLyrics } from "@/hooks/useTrackLyrics";
import { SpotifyLyricsPanel } from "./SpotifyLyricsPanel";
import { SpotifyQueuePanel } from "./SpotifyQueuePanel";
import { SpotifyVolumeControl } from "./SpotifyVolumeControl";
import { SiriPlayButton } from "./SiriPlayButton";
import { extractArtworkPalette, paletteStyle, useArtworkPalette } from "@/lib/palette";
import { blurredArtworkUrl } from "@/lib/spotify/artwork-backdrop";
import { spotifyFallbackPalette } from "@/lib/spotify/artwork";
import { cn, formatTime } from "@/lib/utils";

export function SpotifyNowPlaying() {
  const {
    current,
    active,
    view,
    isPlaying,
    positionMs,
    durationMs,
    volume,
    muted,
    togglePlay,
    next,
    previous,
    seek,
    dockPlayer,
    minimizePlayer,
    queue,
    queueIndex,
    manualQueue,
    contextName,
    playFromQueue,
    shuffle,
    shuffleAvailable,
    shuffleBusy,
    toggleShuffle,
  } = useSpotifyPlayback();
  const palette = useArtworkPalette(
    current?.imageUrl ?? undefined,
    spotifyFallbackPalette,
  );
  // Two oversized, pre-blurred sleeve layers crossfade between songs, so the
  // field keeps the artwork's own colour layout instead of fixed palette
  // blobs. The old layer fades out while the new one fades in.
  const [backdropLayers, setBackdropLayers] = useState<{
    a: string | null;
    b: string | null;
  }>({ a: null, b: null });
  const [backdropSlot, setBackdropSlot] = useState<"a" | "b">("a");
  const backdropSlotRef = useRef<"a" | "b">("a");
  const atmosphereRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const src = current?.imageUrl;
    if (!src) {
      setBackdropLayers({ a: null, b: null });
      backdropSlotRef.current = "a";
      setBackdropSlot("a");
      return;
    }
    let cancelled = false;
    void blurredArtworkUrl(src).then((url) => {
      if (cancelled || !url) return;
      const next = backdropSlotRef.current === "a" ? "b" : "a";
      setBackdropLayers((layers) => ({ ...layers, [next]: url }));
      backdropSlotRef.current = next;
      setBackdropSlot(next);
    });
    return () => {
      cancelled = true;
    };
  }, [current?.imageUrl]);

  const open = active && Boolean(current) && view === "full";
  useAmbientMotion(atmosphereRef, isPlaying, open);
  const panelRef = useRef<HTMLDivElement>(null);
  const [isBrowserFullscreen, setIsBrowserFullscreen] = useState(false);
  const [sidePanel, setSidePanel] = useState<"lyrics" | "queue" | null>(
    "lyrics",
  );
  const queueReturnRef = useRef<"lyrics" | null>(null);
  const transportIdleRef = useRef<number | null>(null);
  const transportHoverRef = useRef(false);
  const transportFocusRef = useRef(false);
  const [transportSubmerged, setTransportSubmerged] = useState(false);

  const clearTransportIdle = useCallback(() => {
    if (transportIdleRef.current !== null) {
      window.clearTimeout(transportIdleRef.current);
      transportIdleRef.current = null;
    }
  }, []);

  const armTransportIdle = useCallback(() => {
    clearTransportIdle();
    if (transportHoverRef.current || transportFocusRef.current) return;
    transportIdleRef.current = window.setTimeout(() => {
      transportIdleRef.current = null;
      if (!transportHoverRef.current && !transportFocusRef.current) {
        setTransportSubmerged(true);
      }
    }, 1_000);
  }, [clearTransportIdle]);

  const wakeTransport = useCallback(() => {
    clearTransportIdle();
    setTransportSubmerged(false);
  }, [clearTransportIdle]);

  useEffect(() => {
    armTransportIdle();
    return clearTransportIdle;
  }, [armTransportIdle, clearTransportIdle]);

  const handleTransportPointerEnter = () => {
    transportHoverRef.current = true;
    wakeTransport();
  };
  const handleTransportPointerDown = () => {
    // Pointer focus must not keep the transport awake after the pointer leaves.
    transportFocusRef.current = false;
    transportHoverRef.current = true;
    wakeTransport();
  };
  const handleTransportPointerLeave = () => {
    transportHoverRef.current = false;
    armTransportIdle();
  };
  const handleTransportFocus = (event: FocusEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    if (!target.matches(":focus-visible")) return;
    transportFocusRef.current = true;
    wakeTransport();
  };
  const handleTransportBlur = () => {
    transportFocusRef.current = false;
    armTransportIdle();
  };

  const lyrics = useTrackLyrics({
    title: current?.name ?? "",
    artist: current?.artists ?? "",
    album: current?.albumName ?? "",
    durationSeconds: durationMs / 1000,
    enabled: open,
  });
  const lyricsPending =
    lyrics.status === "idle" || lyrics.status === "loading";
  const lyricsAvailable =
    lyrics.status === "success" ||
    (lyrics.status === "empty" && lyrics.instrumental);
  const showLyricsToggle = lyricsPending || lyricsAvailable;

  const toggleLyrics = () => {
    if (sidePanel === "lyrics") {
      queueReturnRef.current = null;
      setSidePanel(null);
      return;
    }
    setSidePanel("lyrics");
  };

  const toggleQueue = () => {
    if (sidePanel === "queue") {
      const returnTo = queueReturnRef.current;
      queueReturnRef.current = null;
      setSidePanel(
        returnTo === "lyrics" && showLyricsToggle ? "lyrics" : null,
      );
      return;
    }
    queueReturnRef.current = sidePanel === "lyrics" ? "lyrics" : null;
    setSidePanel("queue");
  };

  useEffect(() => {
    if (!lyricsPending && !lyricsAvailable && sidePanel === "lyrics") {
      setSidePanel(null);
    }
  }, [lyricsAvailable, lyricsPending, sidePanel]);

  useEffect(() => {
    if (!open) return;
    const sources = queue
      .slice(queueIndex + 1, queueIndex + 3)
      .map((item) => item.imageUrl)
      .filter((src): src is string => Boolean(src));
    if (sources.length === 0) return;
    // Warming the next covers keeps a queue selection from repainting the
    // whole ambient stage a beat after the new track appears.
    const warm = () => {
      for (const src of sources) {
        void extractArtworkPalette(src, spotifyFallbackPalette);
        void blurredArtworkUrl(src);
      }
    };
    if (typeof window.requestIdleCallback === "function") {
      const handle = window.requestIdleCallback(warm, { timeout: 1_200 });
      return () => window.cancelIdleCallback?.(handle);
    }
    const timer = window.setTimeout(warm, 200);
    return () => window.clearTimeout(timer);
  }, [open, queue, queueIndex]);

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

  if (!open || !current) return null;

  const safeDuration = Math.max(1, durationMs);
  const progress = Math.min(positionMs, safeDuration);

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
      // Browser may reject fullscreen without a direct gesture.
    }
  };

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="spotify-now-playing-title"
      tabIndex={-1}
      data-testid="spotify-full-player"
      className="spotify-player-enter fixed inset-0 z-[70] overflow-hidden bg-[#040506] outline-none"
      suppressHydrationWarning
      style={paletteStyle(palette)}
    >
      <div
        ref={atmosphereRef}
        className="np-atmosphere absolute inset-0 overflow-hidden"
        aria-hidden
        data-playing={isPlaying}
        data-testid="np-atmosphere"
      >
        <div className="np-atmosphere__base" />
        <div
          className="np-art np-art--a"
          data-active={backdropSlot === "a"}
          style={
            backdropLayers.a
              ? { backgroundImage: `url("${backdropLayers.a}")` }
              : undefined
          }
        />
        <div
          className="np-art np-art--b"
          data-active={backdropSlot === "b"}
          style={
            backdropLayers.b
              ? { backgroundImage: `url("${backdropLayers.b}")` }
              : undefined
          }
        />
        <div className="np-field" aria-hidden>
          <div className="np-orb np-orb--a" />
          <div className="np-orb np-orb--b" />
          <div className="np-orb np-orb--c" />
          <div className="np-orb np-orb--d" />
          <div className="np-wash" />
        </div>
        <div className="np-noise" />
        <div className="np-scrim" />
      </div>

      <div className="relative z-10 flex h-full flex-col">
        <header className="flex shrink-0 items-center justify-end gap-3 px-4 py-4 sm:px-7 lg:px-10">
          <SpotifyVolumeControl
            revealOnHover
            className="hidden sm:flex"
            sliderClassName="w-[72px] xl:w-[96px]"
          />
          <SpotifyVolumeControl showSlider={false} className="flex sm:hidden" />

          <LiquidTooltip
            label={
              shuffleAvailable
                ? shuffle
                  ? "Shuffle on"
                  : "Shuffle"
                : "Shuffle unavailable"
            }
            side="bottom"
          >
            <button
              type="button"
              onClick={() => void toggleShuffle()}
              data-active={shuffle}
              aria-label={shuffle ? "Turn shuffle off" : "Turn shuffle on"}
              aria-pressed={shuffle}
              aria-busy={shuffleBusy || undefined}
              disabled={!shuffleAvailable || shuffleBusy}
              className="icon-btn h-9 w-9 bg-white/[0.04]"
            >
              <Shuffle size={16} />
            </button>
          </LiquidTooltip>

          {showLyricsToggle ? (
            <LiquidTooltip
              label={sidePanel === "lyrics" ? "Hide lyrics" : "Show lyrics"}
              side="bottom"
            >
              <button
                type="button"
                onClick={toggleLyrics}
                data-active={sidePanel === "lyrics"}
                aria-label={
                  sidePanel === "lyrics" ? "Hide lyrics" : "Show lyrics"
                }
                className="icon-btn h-9 w-9 bg-white/[0.04]"
              >
                <Quote size={16} />
              </button>
            </LiquidTooltip>
          ) : null}

          <LiquidTooltip
            label={sidePanel === "queue" ? "Hide queue" : "Show queue"}
            side="bottom"
          >
            <button
              type="button"
              onClick={toggleQueue}
              data-active={sidePanel === "queue"}
              aria-label={sidePanel === "queue" ? "Hide queue" : "Show queue"}
              className="icon-btn h-9 w-9 bg-white/[0.04]"
            >
              <ListMusic size={16} />
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

          <LiquidTooltip label="Minimize to floating window" side="bottom">
            <button
              type="button"
              onClick={() => {
                exitBrowserFullscreen();
                minimizePlayer();
              }}
              className="icon-btn ml-0.5 h-9 w-9 bg-white/[0.04]"
              aria-label="Minimize player to a floating window"
            >
              <PictureInPicture2 size={18} />
            </button>
          </LiquidTooltip>

          <LiquidTooltip label="Dock player" side="bottom">
            <button
              type="button"
              onClick={() => {
                exitBrowserFullscreen();
                dockPlayer();
              }}
              className="icon-btn ml-0.5 h-9 w-9 bg-white/[0.04]"
              aria-label="Dock player"
            >
              <ChevronDown size={19} />
            </button>
          </LiquidTooltip>
        </header>

        <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto lg:overflow-hidden">
          <div
            className={cn(
              "mx-auto flex min-h-full w-full flex-col gap-8 px-4 pb-10 sm:px-7 lg:grid lg:items-center lg:px-12 lg:pb-8",
              sidePanel
                ? "max-w-[1480px] lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)] lg:gap-14"
                : "lg:max-w-[760px] lg:grid-cols-1 lg:gap-0",
            )}
          >
            <section className="flex flex-col justify-center pt-2 lg:pt-0">
              <div className="np-artwork-size relative mx-auto w-full max-w-[min(52vh,440px)] lg:max-w-[min(52vh,470px)]">
                <div className="blended-artwork player-artwork aspect-square">
                  <ArtworkImage
                    artwork={{
                      src: current.imageUrl ?? "",
                      alt: current.albumName || current.name,
                      palette,
                    }}
                    alt={`${current.albumName || current.name} artwork`}
                    loading="eager"
                    className="artwork-img"
                  />
                </div>
              </div>

              <div className="np-below mt-7 text-center">
                <h1
                  id="spotify-now-playing-title"
                  className="np-title text-[2rem] font-medium leading-[1.02] tracking-[-0.04em] text-white/95 sm:text-[2.6rem] lg:text-[2.9rem] xl:text-[3.2rem]"
                >
                  {current.name}
                </h1>

                <p className="np-meta mt-2 text-[13px] font-medium text-white/60">
                  {current.artists}
                  {current.albumName ? ` · ${current.albumName}` : ""}
                </p>

                <div className="np-artwork-size np-seek mx-auto mt-6 w-full max-w-[min(52vh,440px)] lg:max-w-[min(52vh,470px)]">
                  <div className="flex items-center gap-2.5 text-[10px] tabular-nums text-white/40">
                    <span className="w-9 text-right">
                      {formatTime(Math.round(progress / 1000))}
                    </span>
                    <LiquidSlider
                      value={progress}
                      max={safeDuration}
                      onChange={(value) => void seek(value)}
                      ariaLabel="Seek in track"
                      ariaValueText={formatTime(Math.round(progress / 1000))}
                      step={1000}
                      className="flex-1"
                    />
                    <span className="w-9">
                      -{formatTime(Math.max(0, Math.round((durationMs - progress) / 1000)))}
                    </span>
                  </div>

                  <div
                    className="np-transport mt-4 flex items-center justify-center"
                    data-testid="np-transport"
                    data-submerged={transportSubmerged ? "true" : "false"}
                    onPointerEnter={handleTransportPointerEnter}
                    onPointerDown={handleTransportPointerDown}
                    onPointerLeave={handleTransportPointerLeave}
                    onFocusCapture={handleTransportFocus}
                    onBlurCapture={handleTransportBlur}
                  >
                    <LiquidTooltip label="Previous">
                      <button
                        type="button"
                        onClick={() => void previous()}
                        className="icon-btn h-11 w-11"
                        aria-label="Previous track"
                      >
                        <SkipBack size={21} fill="currentColor" />
                      </button>
                    </LiquidTooltip>
                    <SiriPlayButton
                      playing={isPlaying}
                      level={muted ? 0 : volume}
                      trackId={current.id}
                      onToggle={() => void togglePlay()}
                    />
                    <LiquidTooltip label="Next">
                      <button
                        type="button"
                        onClick={() => void next()}
                        className="icon-btn h-11 w-11"
                        aria-label="Next track"
                      >
                        <SkipForward size={21} fill="currentColor" />
                      </button>
                    </LiquidTooltip>
                  </div>
                </div>
              </div>
            </section>

            {sidePanel === "lyrics" ? (
              <SpotifyLyricsPanel
                title={current.name}
                artist={current.artists}
                lyrics={lyrics}
                positionMs={positionMs}
                isPlaying={isPlaying}
                onSeek={(value) => void seek(value)}
                className="np-lyrics-height mx-auto flex w-full max-w-[720px] min-h-0 flex-col pb-4"
              />
            ) : sidePanel === "queue" ? (
              <SpotifyQueuePanel
                queue={queue}
                queueIndex={queueIndex}
                manualQueue={manualQueue}
                contextName={contextName}
                onPlay={playFromQueue}
                className="np-lyrics-height mx-auto flex w-full max-w-[720px] min-h-0 flex-col pb-4"
              />
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
