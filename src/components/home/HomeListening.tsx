"use client";

import { SkipBack, SkipForward } from "lucide-react";
import { toSpotifyArtwork } from "@/lib/spotify/artwork";
import { useSpotifyPlayback } from "@/components/providers/SpotifyPlaybackProvider";
import { useUiStore } from "@/store/ui";
import { ArtworkImage } from "@/components/ui/ArtworkImage";
import { SiriPlayButton } from "@/components/player/SiriPlayButton";
import { SpotifyQuickQueue } from "@/components/player/SpotifyQuickQueue";
import { LiquidSlider } from "@/components/ui/LiquidSlider";
import { LiquidTooltip } from "@/components/ui/LiquidTooltip";
import { formatTime } from "@/lib/utils";
import { HomeIdle } from "./HomeIdle";
import { SpotifyVolumeControl } from "@/components/player/SpotifyVolumeControl";

export function HomeListening() {
  const spotify = useSpotifyPlayback();
  const homeSection = useUiStore((state) => state.homeSection);
  const current = spotify.current;

  if (!spotify.active || !current) {
    return <HomeIdle />;
  }

  const artwork = toSpotifyArtwork(
    current.imageUrl,
    current.albumName || current.name,
  );
  const artist = current.artists || "Unknown artist";
  const album = current.albumName;
  const positionSec = spotify.positionMs / 1000;
  const durationSec = spotify.durationMs / 1000;
  const safeDuration = Math.max(1, durationSec);

  return (
    <section className="relative flex flex-col items-center pt-2 text-center sm:pt-6">
      <div
        className="pointer-events-none absolute left-1/2 top-4 h-[360px] w-[min(80vw,520px)] -translate-x-1/2 rounded-full opacity-[0.14] blur-[130px]"
        style={{ background: artwork.palette.a }}
        aria-hidden
      />

      <div className="relative">
        <button
          type="button"
          onClick={spotify.openFullPlayer}
          aria-label="Open full player"
          className="artwork-shell artwork-hover relative block aspect-square w-[clamp(220px,28vw,300px)] cursor-pointer rotate-[0.6deg] rounded-[24px] text-left transition-transform duration-700 ease-spring hover:rotate-0 hover:scale-[1.006] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--acid)] focus-visible:ring-offset-4 focus-visible:ring-offset-[#040506]"
        >
          <ArtworkImage
            artwork={artwork}
            alt={current.name}
            loading="eager"
            priority
            sizes="(min-width: 1024px) 300px, (min-width: 640px) 28vw, 220px"
            className="artwork-img"
          />
        </button>
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-full h-24 overflow-hidden rounded-[24px] opacity-[0.16] blur-[3px] [mask-image:linear-gradient(to_bottom,rgba(0,0,0,0.7),transparent_85%)]"
        >
          <ArtworkImage
            artwork={artwork}
            alt=""
            loading="lazy"
            sizes="(min-width: 1024px) 300px, (min-width: 640px) 28vw, 220px"
            className="-scale-y-100 object-cover"
          />
        </div>
        <div className="absolute -bottom-5 left-1/2 z-10 flex -translate-x-1/2 items-center gap-3">
          <LiquidTooltip label="Previous">
            <button
              type="button"
              onClick={() => void spotify.previous()}
              aria-label="Previous track"
              className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-white/[0.14] bg-black/30 text-white/75 shadow-[0_10px_28px_-12px_rgba(0,0,0,0.8)] backdrop-blur-md transition-[background-color,border-color,color,transform] duration-200 hover:border-white/25 hover:bg-black/45 hover:text-white active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--acid)]"
            >
              <SkipBack size={17} fill="currentColor" />
            </button>
          </LiquidTooltip>

          <SiriPlayButton
            size="panel"
            playing={spotify.isPlaying}
            level={spotify.muted ? 0 : spotify.volume}
            trackId={current.id}
            labels={{
              play: "Play current track",
              pause: "Pause current track",
            }}
            onToggle={() => void spotify.togglePlay()}
          />

          <LiquidTooltip label="Next">
            <button
              type="button"
              onClick={() => void spotify.next()}
              aria-label="Next track"
              className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-white/[0.14] bg-black/30 text-white/75 shadow-[0_10px_28px_-12px_rgba(0,0,0,0.8)] backdrop-blur-md transition-[background-color,border-color,color,transform] duration-200 hover:border-white/25 hover:bg-black/45 hover:text-white active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--acid)]"
            >
              <SkipForward size={17} fill="currentColor" />
            </button>
          </LiquidTooltip>
        </div>
      </div>

      <h1 className="mt-16 max-w-[22ch] text-[2rem] font-medium leading-[1.02] tracking-[-0.05em] text-white/95 sm:text-[3rem] lg:text-[3.3rem]">
        {current.name}
      </h1>

      <div className="mt-4 flex flex-wrap items-center justify-center gap-x-3 gap-y-2 text-[9.5px] font-medium uppercase tracking-[0.2em] text-white/35">
        <span>{artist}</span>
        {album && album !== current.name ? (
          <>
            <span className="h-px w-4 bg-white/15" aria-hidden />
            <span>{album}</span>
          </>
        ) : null}
      </div>

      <div className="mt-7 flex w-full max-w-[460px] items-center gap-3 px-2 text-[9.5px] tabular-nums text-white/35">
        <span className="w-8 text-right">
          {formatTime(Math.round(positionSec))}
        </span>
        <LiquidSlider
          value={Math.min(positionSec, safeDuration)}
          max={safeDuration}
          onChange={(value) => void spotify.seek(value * 1000)}
          ariaLabel="Seek in current track"
          ariaValueText={formatTime(
            Math.round(Math.min(positionSec, safeDuration)),
          )}
          step={0.5}
          className="flex-1"
        />
        <span className="w-8">
          -{formatTime(Math.max(0, Math.round(durationSec - positionSec)))}
        </span>
      </div>

      <SpotifyVolumeControl
        className="mt-3 justify-center"
        sliderClassName="w-[112px]"
      />

      {homeSection ? null : (
        <SpotifyQuickQueue
          palette={artwork.palette}
          queue={spotify.queue}
          queueIndex={spotify.queueIndex}
          manualQueue={spotify.manualQueue}
          contextName={spotify.contextName}
          onAdd={spotify.queueTrack}
          onPlay={spotify.playFromQueue}
        />
      )}
    </section>
  );
}
