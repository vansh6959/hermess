"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Disc3,
  ListMusic,
  Maximize2,
  Play,
  Shuffle,
  SkipBack,
  SkipForward,
} from "lucide-react";
import {
  useSpotifyPlayback,
} from "@/components/providers/SpotifyPlaybackProvider";
import { useSpotifyHistory } from "@/hooks/useSpotifyHistory";
import { SiriPlayButton } from "@/components/player/SiriPlayButton";
import { ArtworkImage } from "@/components/ui/ArtworkImage";
import { LiquidSlider } from "@/components/ui/LiquidSlider";
import { LiquidTooltip } from "@/components/ui/LiquidTooltip";
import { toSpotifyArtwork } from "@/lib/spotify/artwork";
import { splitUpcoming } from "@/lib/spotify/queue-order";
import type { SpotifyNowPlaying } from "@/lib/spotify/playback-types";
import type { SpotifyHistoryTrack } from "@/lib/spotify/history";
import { cn, formatTime } from "@/lib/utils";

type SideTab = "recent" | "queue";

function historyNowPlaying(track: SpotifyHistoryTrack): SpotifyNowPlaying {
  return {
    id: track.id,
    name: track.name,
    artists: track.artists,
    albumName: track.albumName,
    imageUrl: track.imageUrl,
    durationMs: 0,
    spotifyUrl: track.spotifyUrl,
  };
}

function TrackArtwork({
  imageUrl,
  title,
}: {
  imageUrl: string | null;
  title: string;
}) {
  return (
    <span className="artwork-shell h-9 w-9 shrink-0 rounded-[9px]">
      <ArtworkImage
        artwork={toSpotifyArtwork(imageUrl, title)}
        alt=""
        loading="lazy"
        sizes="36px"
        className="artwork-img"
      />
    </span>
  );
}

function TabButton({
  active,
  label,
  count,
  onClick,
}: {
  active: boolean;
  label: string;
  count: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[10.5px] font-medium transition-[background-color,color] duration-150",
        active
          ? "bg-white/[0.09] text-white"
          : "text-[var(--text-mute)] hover:bg-white/[0.04] hover:text-white/80",
      )}
    >
      {label}
      {count > 0 ? (
        <span className={active ? "text-white/40" : "text-white/25"}>
          {count}
        </span>
      ) : null}
    </button>
  );
}

export function LibraryPlaybackPanel() {
  const spotify = useSpotifyPlayback();
  const history = useSpotifyHistory();
  const [tab, setTab] = useState<SideTab>("recent");
  const [dragPosition, setDragPosition] = useState<number | null>(null);
  const current = spotify.current;
  const active = spotify.active;
  const playing = active && Boolean(current);
  const upcoming = useMemo(
    () => spotify.queue.slice(spotify.queueIndex + 1),
    [spotify.queue, spotify.queueIndex],
  );
  const { manual, context } = useMemo(
    () =>
      splitUpcoming(
        spotify.queue,
        spotify.queueIndex,
        spotify.manualQueue.length,
      ),
    [spotify.manualQueue.length, spotify.queue, spotify.queueIndex],
  );
  const manualStart = spotify.queueIndex + 1;
  const contextStart = manualStart + manual.length;

  useEffect(() => {
    setDragPosition(null);
  }, [current?.id]);

  const progress = dragPosition ?? spotify.positionMs;
  const duration = Math.max(1, spotify.durationMs);

  const renderQueueRow = (
    track: SpotifyNowPlaying,
    index: number,
    first: boolean,
  ) => (
    <li key={`${track.id}-${index}`}>
      <button
        type="button"
        onClick={() => spotify.playFromQueue(index)}
        aria-label={`Play ${track.name}`}
        className="group flex w-full min-w-0 items-center gap-2.5 rounded-[12px] px-2 py-1.5 text-left transition-colors hover:bg-white/[0.035] focus-visible:bg-white/[0.05] focus-visible:outline-none"
      >
        <TrackArtwork imageUrl={track.imageUrl} title={track.name} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[11.5px] font-medium text-white/75 group-hover:text-white">
            {track.name}
          </span>
          <span className="mt-0.5 block truncate text-[10px] text-[var(--text-mute)]">
            {track.artists}
          </span>
        </span>
        <span className="shrink-0 text-[8.5px] uppercase tracking-[0.14em] text-white/25">
          {first ? "Next" : ""}
        </span>
        <Play
          size={11}
          fill="currentColor"
          aria-hidden
          className="shrink-0 text-white/20 opacity-0 transition-opacity group-hover:text-[var(--acid)] group-hover:opacity-100 group-focus-visible:opacity-100"
        />
      </button>
    </li>
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex shrink-0 items-center justify-between gap-3 px-4 pb-2 pt-4 sm:px-5">
        <h2 className="text-[9.5px] font-medium uppercase tracking-[0.28em] text-[var(--text-mute)]">
          Now playing
        </h2>
        {playing ? (
          <button
            type="button"
            onClick={spotify.openFullPlayer}
            aria-label="Open full player"
            className="grid h-8 w-8 place-items-center rounded-full text-white/35 transition-colors hover:bg-white/[0.05] hover:text-white/80"
          >
            <Maximize2 size={13} />
          </button>
        ) : null}
      </header>

      <div className="shrink-0 px-4 pb-3 sm:px-5">
        {playing && current ? (
          <div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={spotify.openFullPlayer}
                aria-label="Open full player"
                className="artwork-shell h-[76px] w-[76px] shrink-0 rounded-[15px] text-left"
              >
                <ArtworkImage
                  artwork={toSpotifyArtwork(
                    current.imageUrl,
                    current.albumName || current.name,
                  )}
                  alt=""
                  loading="eager"
                  sizes="76px"
                  className="artwork-img"
                />
              </button>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] font-medium tracking-[-0.015em] text-white/95">
                  {current.name}
                </p>
                <p className="mt-1 truncate text-[11px] text-[var(--text-mute)]">
                  {current.artists || "Unknown artist"}
                </p>
                {current.albumName ? (
                  <p className="mt-0.5 truncate text-[10px] text-white/30">
                    {current.albumName}
                  </p>
                ) : null}
              </div>
            </div>

            <div className="mt-3">
              <LiquidSlider
                value={Math.min(progress, duration)}
                max={duration}
                step={1000}
                ariaLabel="Seek in current track"
                ariaValueText={formatTime(
                  Math.round(Math.min(progress, duration) / 1000),
                )}
                onChange={(value) => setDragPosition(value)}
                onCommit={(value) => {
                  void spotify.seek(value);
                  setDragPosition(null);
                }}
                className="h-4"
              />
              <div className="mt-0.5 flex items-center justify-between text-[9px] tabular-nums text-white/30">
                <span>{formatTime(Math.round(progress / 1000))}</span>
                <span>{formatTime(Math.round(duration / 1000))}</span>
              </div>
            </div>

            <div className="mt-2 flex items-center justify-center gap-2">
              <LiquidTooltip
                label={
                  spotify.shuffleAvailable
                    ? spotify.shuffle
                      ? "Shuffle on"
                      : "Shuffle"
                    : "Shuffle unavailable"
                }
              >
                <button
                  type="button"
                  onClick={() => void spotify.toggleShuffle()}
                  aria-label={
                    spotify.shuffle ? "Turn shuffle off" : "Turn shuffle on"
                  }
                  aria-pressed={spotify.shuffle}
                  aria-busy={spotify.shuffleBusy || undefined}
                  disabled={!spotify.shuffleAvailable || spotify.shuffleBusy}
                  data-active={spotify.shuffle}
                  className="icon-btn h-8 w-8"
                >
                  <Shuffle size={14} />
                </button>
              </LiquidTooltip>
              <LiquidTooltip label="Previous">
                <button
                  type="button"
                  onClick={() => void spotify.previous()}
                  aria-label="Previous track"
                  className="icon-btn h-8 w-8"
                >
                  <SkipBack size={14} fill="currentColor" />
                </button>
              </LiquidTooltip>
              <SiriPlayButton
                size="compact"
                playing={spotify.isPlaying}
                level={spotify.muted ? 0 : spotify.volume}
                trackId={current.id}
                className="mx-0.5"
                onToggle={() => void spotify.togglePlay()}
              />
              <LiquidTooltip label="Next">
                <button
                  type="button"
                  onClick={() => void spotify.next()}
                  aria-label="Next track"
                  className="icon-btn h-8 w-8"
                >
                  <SkipForward size={14} fill="currentColor" />
                </button>
              </LiquidTooltip>
            </div>
          </div>
        ) : (
          <div className="liquid-inset flex items-center gap-3 rounded-[18px] px-3.5 py-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-white/[0.07] bg-white/[0.03] text-white/30">
              <Disc3 size={17} />
            </span>
            <div className="min-w-0">
              <p className="text-[12px] font-medium text-white/75">
                Nothing playing
              </p>
              <p className="mt-0.5 text-[10px] leading-relaxed text-[var(--text-mute)]">
                Choose a playlist to start listening.
              </p>
            </div>
          </div>
        )}
      </div>

      <div className="flex shrink-0 items-center justify-between gap-2 border-t border-white/[0.06] px-4 pb-1 pt-2.5 sm:px-5">
        <div className="flex items-center gap-0.5">
          <TabButton
            active={tab === "recent"}
            label="Recent"
            count={history.length}
            onClick={() => setTab("recent")}
          />
          <TabButton
            active={tab === "queue"}
            label="Queue"
            count={upcoming.length}
            onClick={() => setTab("queue")}
          />
        </div>
        <span className="pr-1 text-[9px] uppercase tracking-[0.18em] text-white/20">
          {tab === "recent" ? "Played" : "Up next"}
        </span>
      </div>

      <div className="library-song-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pb-3 pt-1">
        {tab === "recent" ? (
          history.length > 0 ? (
            <ul className="space-y-px">
              {history.map((track) => (
                <li key={`${track.id}-${track.playedAt}`}>
                  <button
                    type="button"
                    onClick={() =>
                      spotify.requestPlay({
                        uris: [`spotify:track:${track.id}`],
                        track: historyNowPlaying(track),
                      })
                    }
                    aria-label={`Play ${track.name} by ${track.artists}`}
                    className="group flex w-full min-w-0 items-center gap-2.5 rounded-[12px] px-2 py-1.5 text-left transition-colors hover:bg-white/[0.035] focus-visible:bg-white/[0.05] focus-visible:outline-none"
                  >
                    <TrackArtwork imageUrl={track.imageUrl} title={track.name} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[11.5px] font-medium text-white/80 group-hover:text-white">
                        {track.name}
                      </span>
                      <span className="mt-0.5 block truncate text-[10px] text-[var(--text-mute)]">
                        {track.artists}
                      </span>
                    </span>
                    <Play
                      size={11}
                      fill="currentColor"
                      aria-hidden
                      className="shrink-0 text-white/20 transition-colors group-hover:text-[var(--acid)]"
                    />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="px-3 py-8 text-center">
              <ListMusic size={16} className="mx-auto text-white/20" />
              <p className="mt-2 text-[10.5px] text-[var(--text-mute)]">
                Tracks you play will appear here.
              </p>
            </div>
          )
        ) : upcoming.length > 0 ? (
          <div className="space-y-2">
            {manual.length > 0 ? (
              <div>
                <p className="px-2 pb-1 pt-1 text-[8px] font-medium uppercase tracking-[0.2em] text-white/25">
                  Next in queue
                </p>
                <ul className="space-y-px">
                  {manual.map((track, index) =>
                    renderQueueRow(track, manualStart + index, index === 0),
                  )}
                </ul>
              </div>
            ) : null}
            {context.length > 0 ? (
              <div>
                <p className="truncate px-2 pb-1 pt-1 text-[8px] font-medium uppercase tracking-[0.2em] text-white/25">
                  Next from: {spotify.contextName ?? "this playlist"}
                </p>
                <ul className="space-y-px">
                  {context.map((track, index) =>
                    renderQueueRow(
                      track,
                      contextStart + index,
                      manual.length === 0 && index === 0,
                    ),
                  )}
                </ul>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="px-3 py-8 text-center">
            <ListMusic size={16} className="mx-auto text-white/20" />
            <p className="mt-2 text-[10.5px] text-[var(--text-mute)]">
              Nothing queued right now.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
