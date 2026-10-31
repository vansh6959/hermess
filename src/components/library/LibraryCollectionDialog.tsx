"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ListPlus, Play, Search, Shuffle, X } from "lucide-react";
import type { LibraryCollection } from "@/lib/library/collections";
import type { ImportedTrack } from "@/lib/import/types";
import type { SpotifyNowPlaying } from "@/lib/spotify/playback-types";
import { AudioPulse } from "@/components/player/AudioPulse";
import { ArtworkImage } from "@/components/ui/ArtworkImage";
import { toSpotifyArtwork } from "@/lib/spotify/artwork";
import {
  useSpotifyNowPlayingMeta,
  useSpotifyPlaybackActions,
  useSpotifyPlaybackActive,
} from "@/components/providers/SpotifyPlaybackProvider";
import { useFocusTrap } from "@/hooks/useFocusTrap";
import { AddToPlaylistButton } from "@/components/playlists/AddToPlaylistButton";

function isPlayable(track: ImportedTrack): boolean {
  return track.source === "spotify" && Boolean(track.id);
}

function formatDuration(durationMs: number): string {
  if (!Number.isFinite(durationMs) || durationMs <= 0) return "";
  const totalSeconds = Math.round(durationMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function toNowPlaying(track: ImportedTrack): SpotifyNowPlaying {
  return {
    id: track.id,
    name: track.name,
    artists: track.artists,
    albumName: track.albumName,
    imageUrl: track.imageUrl,
    durationMs: track.durationMs,
    spotifyUrl:
      track.url ?? `https://open.spotify.com/track/${track.id}`,
  };
}

function TrackRow({
  track,
  index,
  playing,
  onPlay,
  onQueue,
}: {
  track: ImportedTrack;
  index: number;
  playing: boolean;
  onPlay: () => void;
  onQueue?: () => void;
}) {
  const playable = isPlayable(track);
  const content = (
    <>
      <span className="w-4 shrink-0 text-right text-[9.5px] tabular-nums text-white/25 group-hover:text-white/50">
        {index + 1}
      </span>
      <span className="artwork-shell h-9 w-9 shrink-0 rounded-lg">
        <ArtworkImage
          artwork={toSpotifyArtwork(track.imageUrl, track.name)}
          alt=""
          loading="lazy"
          sizes="36px"
          className="artwork-img"
        />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[12.5px] font-medium text-white/80 group-hover:text-white">
          {track.name}
        </span>
        <span className="mt-0.5 block truncate text-[10.5px] text-[var(--text-mute)]">
          {track.artists}
        </span>
      </span>
      <span className="w-9 shrink-0 text-right text-[10px] tabular-nums text-white/25">
        {formatDuration(track.durationMs)}
      </span>
      <span className="grid w-[22px] shrink-0 place-items-center">
        {playing ? (
          <AudioPulse
            size="sm"
            level={0.8}
            className="text-[#c7d9cc]"
          />
        ) : playable ? (
          <Play
            size={11}
            fill="currentColor"
            className="shrink-0 text-white/30 transition-colors group-hover:text-[var(--acid)]"
            aria-hidden
          />
        ) : null}
      </span>
    </>
  );

  const rowClass =
    "flex min-w-0 flex-1 items-center gap-3 rounded-xl px-2.5 py-2 text-left";
  const wrapperClass =
    "group flex items-center gap-0.5 rounded-xl transition-colors hover:bg-white/[0.045] focus-within:bg-white/[0.05]";

  return (
    <div className={wrapperClass}>
      {playable ? (
        <button
          type="button"
          onClick={onPlay}
          aria-label={`Play ${track.name}`}
          className={rowClass}
        >
          {content}
        </button>
      ) : (
        <div className={rowClass}>{content}</div>
      )}
      {playable && onQueue ? (
        <button
          type="button"
          onClick={onQueue}
          aria-label={`Add ${track.name} to queue`}
          className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-white/40 transition hover:bg-white/10 hover:text-[#8df0ad]"
        >
          <ListPlus size={14} aria-hidden />
        </button>
      ) : null}
      {playable ? (
        <AddToPlaylistButton
          track={{
            id: track.id,
            name: track.name,
            artists: track.artists,
            albumName: track.albumName,
            imageUrl: track.imageUrl,
            durationMs: track.durationMs,
            spotifyUrl:
              track.url ?? `https://open.spotify.com/track/${track.id}`,
          }}
          className="mr-1"
        />
      ) : null}
    </div>
  );
}

export function LibraryCollectionDialog({
  collection,
  onClose,
}: {
  collection: LibraryCollection;
  onClose: () => void;
}) {
  const spotify = useSpotifyPlaybackActions();
  const playbackActive = useSpotifyPlaybackActive();
  const nowPlaying = useSpotifyNowPlayingMeta();
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useFocusTrap(true, panelRef);
  const [mounted, setMounted] = useState(false);
  const [query, setQuery] = useState("");
  const needle = query.trim().toLowerCase();
  const playableTracks = useMemo(
    () => collection.tracks.filter(isPlayable),
    [collection.tracks],
  );
  const visibleTracks = useMemo(
    () =>
      needle
        ? collection.tracks.filter(
            (track) =>
              track.name.toLowerCase().includes(needle) ||
              track.artists.toLowerCase().includes(needle) ||
              track.albumName.toLowerCase().includes(needle),
          )
        : collection.tracks,
    [collection.tracks, needle],
  );

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const timer = window.setTimeout(() => panelRef.current?.focus(), 40);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      onCloseRef.current();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previous;
      window.clearTimeout(timer);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  if (!mounted) return null;

  const playAll = () => {
    if (playableTracks.length === 0) return;
    spotify.requestPlay({
      uris: playableTracks.map((track) => `spotify:track:${track.id}`),
      offset: 0,
      queue: playableTracks.map(toNowPlaying),
      queueIndex: 0,
      track: toNowPlaying(playableTracks[0]),
      contextName: collection.name,
    });
  };

  const shufflePlay = () => {
    if (playableTracks.length < 2) return;
    spotify.requestPlay({
      uris: playableTracks.map((track) => `spotify:track:${track.id}`),
      offset: 0,
      queue: playableTracks.map(toNowPlaying),
      queueIndex: 0,
      track: toNowPlaying(playableTracks[0]),
      shuffle: true,
      contextName: collection.name,
    });
  };

  const playTrack = (track: ImportedTrack) => {
    if (!isPlayable(track)) {
      if (track.url) window.open(track.url, "_blank", "noopener,noreferrer");
      return;
    }
    spotify.requestPlay({
      uris: [`spotify:track:${track.id}`],
      track: toNowPlaying(track),
    });
  };

  const queueTrack = (track: ImportedTrack) => {
    if (!isPlayable(track)) return;
    void spotify.queueTrack(toNowPlaying(track));
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[85] flex items-end justify-center bg-black/65 backdrop-blur-sm animate-fade-in sm:items-center sm:px-4 sm:py-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={collection.name}
        tabIndex={-1}
        className="flex w-full max-w-[760px] flex-col outline-none"
      >
        <div
          role="region"
          aria-label={collection.name}
          className="library-panel-enter liquid library-panel rim grain relative z-20 flex max-h-[calc(100dvh_-_8rem)] w-full flex-col overflow-hidden rounded-[24px] shadow-[0_36px_100px_-32px_rgba(0,0,0,0.95)]"
        >
          <div className="relative z-10 flex shrink-0 items-start justify-between gap-4 px-5 pb-3 pt-4">
            <div className="min-w-0">
              <p className="truncate text-[15px] font-medium tracking-[-0.01em] text-white/90">
                {collection.name}
              </p>
              <p className="mt-0.5 text-[10.5px] text-[var(--text-mute)]">
                {needle
                  ? `${visibleTracks.length} of ${collection.trackCount} songs`
                  : `${collection.trackCount} ${
                      collection.trackCount === 1 ? "song" : "songs"
                    }`}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              {playableTracks.length > 0 ? (
                <>
                  <button
                    type="button"
                    onClick={shufflePlay}
                    disabled={playableTracks.length < 2}
                    aria-label={`Shuffle ${collection.name}`}
                    className="grid h-8 w-8 place-items-center rounded-full border border-white/[0.08] text-white/45 transition-colors hover:border-white/20 hover:text-white/85 disabled:opacity-35"
                  >
                    <Shuffle size={13} />
                  </button>
                  <button
                    type="button"
                    onClick={playAll}
                    aria-label={`Play ${collection.name}`}
                    className="grid h-8 w-8 place-items-center rounded-full bg-[var(--acid)] text-[#07100b] transition-transform duration-200 ease-spring hover:scale-105 active:scale-95"
                  >
                    <Play size={12} fill="currentColor" className="ml-0.5" />
                  </button>
                </>
              ) : null}
              <button
                type="button"
                onClick={onClose}
                aria-label={`Close ${collection.name}`}
                className="grid h-8 w-8 place-items-center rounded-full border border-white/[0.08] text-white/45 transition-colors hover:border-white/20 hover:text-white/85"
              >
                <X size={13} />
              </button>
            </div>
          </div>

          <div className="relative z-10 shrink-0 px-5 pb-3">
            <div className="flex h-9 items-center gap-2 rounded-full border border-white/[0.09] bg-white/[0.035] px-3 transition-[border-color,background-color,box-shadow] duration-200 focus-within:border-[rgba(143,185,163,0.4)] focus-within:bg-white/[0.06] focus-within:shadow-[0_0_0_3px_rgba(143,185,163,0.07)]">
              <Search
                size={12}
                aria-hidden
                className="shrink-0 text-[var(--mint)]"
              />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Escape" && query) {
                    event.stopPropagation();
                    setQuery("");
                  }
                }}
                placeholder="Find a song"
                aria-label={`Search songs in ${collection.name}`}
                className="h-full min-w-0 flex-1 bg-transparent text-[12px] text-white/85 outline-none placeholder:text-white/30"
              />
              {query ? (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  aria-label="Clear song search"
                  className="grid h-5 w-5 shrink-0 place-items-center rounded-full text-white/35 transition hover:bg-white/[0.08] hover:text-white/75"
                >
                  <X size={11} />
                </button>
              ) : null}
            </div>
          </div>

          <div className="relative z-10 mx-5 h-px shrink-0 bg-white/[0.06]" />

          <div className="library-song-scroll relative z-10 min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 py-2">
            {collection.tracks.length === 0 ? (
              <p className="px-3 py-10 text-center text-[11.5px] text-[var(--text-mute)]">
                No songs here yet
              </p>
            ) : visibleTracks.length === 0 ? (
              <p className="px-3 py-10 text-center text-[11.5px] text-[var(--text-mute)]">
                No songs match “{query.trim()}”
              </p>
            ) : (
              <ul className="space-y-px">
                {visibleTracks.map((track, index) => (
                  <li key={`${track.source}:${track.id || index}`}>
                    <TrackRow
                      track={track}
                      index={index}
                      playing={
                        nowPlaying.isPlaying && nowPlaying.trackId === track.id
                      }
                      onPlay={() => playTrack(track)}
                      onQueue={
                        playbackActive && isPlayable(track)
                          ? () => queueTrack(track)
                          : undefined
                      }
                    />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
