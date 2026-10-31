"use client";

import {
  AlertTriangle,
  ArrowUpRight,
  ListPlus,
  Play,
  RefreshCw,
} from "lucide-react";
import type {
  SpotifyAlbumResult,
  SpotifyApiErrorBody,
  SpotifyArtistResult,
  SpotifyTrackResult,
} from "@/lib/spotify/types";
import { cn, formatTime } from "@/lib/utils";
import { ArtworkImage } from "@/components/ui/ArtworkImage";
import { AddToPlaylistButton } from "@/components/playlists/AddToPlaylistButton";
import { toSpotifyArtwork } from "@/lib/spotify/artwork";

export function SpotifyTrackRow({
  track,
  onPlay,
  onQueue,
}: {
  track: SpotifyTrackResult;
  onPlay: () => void;
  onQueue?: () => void;
}) {
  return (
    <div className="group flex items-center gap-1 rounded-xl transition-colors hover:bg-white/[0.045] focus-within:bg-white/[0.05]">
      <button
        type="button"
        onClick={onPlay}
        className="grid min-w-0 flex-1 grid-cols-[40px_minmax(0,1fr)_auto_auto] items-center gap-3 rounded-xl px-2 py-2 text-left focus-visible:outline-none"
        aria-label={`Play ${track.name} by ${track.artists} in Hermes`}
      >
        <span className="artwork-shell h-10 w-10 rounded-lg">
          <ArtworkImage
            artwork={toSpotifyArtwork(track.imageUrl, "")}
            alt=""
            loading="lazy"
          />
        </span>
        <span className="min-w-0">
          <span className="flex items-center gap-1.5">
            <span className="truncate text-[13px] font-medium text-white">
              {track.name}
            </span>
            {track.explicit && (
              <span
                className="rounded-[3px] border border-white/20 px-1 text-[8px] font-semibold text-white/45"
                aria-label="Explicit"
              >
                E
              </span>
            )}
          </span>
          <span className="mt-0.5 block truncate text-[11px] text-[var(--text-mute)]">
            {track.artists} · {track.albumName}
          </span>
        </span>
        <span className="hidden text-[10px] tabular-nums text-white/35 sm:block">
          {formatTime(Math.round(track.durationMs / 1000))}
        </span>
        <span className="grid h-6 w-6 place-items-center rounded-full text-white/25 transition group-hover:text-[#8df0ad]">
          <Play size={11} fill="currentColor" aria-hidden />
        </span>
      </button>
      {onQueue ? (
        <button
          type="button"
          onClick={onQueue}
          aria-label={`Add ${track.name} by ${track.artists} to queue`}
          className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-white/40 transition hover:bg-white/10 hover:text-[#8df0ad]"
        >
          <ListPlus size={14} aria-hidden />
        </button>
      ) : null}
      <AddToPlaylistButton track={track} className="mr-1" />
    </div>
  );
}

export function SpotifyAlbumCard({
  album,
  onPlay,
  className,
}: {
  album: SpotifyAlbumResult;
  onPlay: () => void;
  className?: string;
}) {
  return (
    <div className={cn("group relative", className)}>
      <button
        type="button"
        onClick={onPlay}
        className="block w-full text-left focus-visible:outline-none"
        aria-label={`Play ${album.name} by ${album.artists} in Hermes`}
      >
        <div className="artwork-shell artwork-hover relative aspect-square">
          <ArtworkImage
            artwork={toSpotifyArtwork(album.imageUrl, album.name)}
            alt=""
            loading="lazy"
            className="artwork-img"
          />
          <span className="pointer-events-none absolute bottom-2.5 right-2.5 z-[2] grid h-8 w-8 place-items-center rounded-full bg-[var(--acid)] text-[#10140a] opacity-0 shadow-lg transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
            <Play size={14} fill="currentColor" className="ml-0.5" />
          </span>
        </div>
        <div className="mt-3 px-0.5">
          <h3 className="truncate text-[13.5px] font-semibold tracking-tight text-white">
            {album.name}
          </h3>
          <p className="mt-0.5 truncate text-[12px] text-[var(--text-mute)]">
            {album.artists}
            {album.releaseYear ? ` · ${album.releaseYear}` : ""}
          </p>
        </div>
      </button>
    </div>
  );
}

export function SpotifyArtistCard({
  artist,
  onOpen,
  className,
}: {
  artist: SpotifyArtistResult;
  onOpen: () => void;
  className?: string;
}) {
  return (
    <div className={cn("group relative", className)}>
      <button
        type="button"
        onClick={onOpen}
        className="block w-full text-left focus-visible:outline-none"
        aria-label={`Open ${artist.name} artist page`}
      >
        <div className="artwork-shell artwork-hover relative aspect-square rounded-full">
          <ArtworkImage
            artwork={toSpotifyArtwork(artist.imageUrl, artist.name)}
            alt=""
            loading="lazy"
            className="artwork-img"
          />
          <span className="pointer-events-none absolute bottom-2.5 right-2.5 z-[2] grid h-8 w-8 place-items-center rounded-full bg-[var(--acid)] text-[#10140a] opacity-0 shadow-lg transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
            <ArrowUpRight size={14} />
          </span>
        </div>
        <div className="mt-3 px-0.5">
          <h3 className="truncate text-[13.5px] font-semibold tracking-tight text-white">
            {artist.name}
          </h3>
          <p className="mt-0.5 truncate text-[12px] text-[var(--text-mute)]">
            {artist.genres[0] ?? "Artist"}
          </p>
        </div>
      </button>
    </div>
  );
}

export function SpotifyNotice({
  error,
  onRetry,
  localFallback = false,
  compact = false,
}: {
  error: SpotifyApiErrorBody;
  onRetry?: () => void;
  localFallback?: boolean;
  compact?: boolean;
}) {
  return (
    <div
      role="alert"
      className={cn(
        "liquid-inset flex flex-wrap items-center gap-3 rounded-2xl px-4 py-3",
        compact ? "text-[11.5px]" : "text-[12px]",
      )}
    >
      <AlertTriangle size={15} className="shrink-0 text-[#e8b96a]" aria-hidden />
      <p className="min-w-0 flex-1 leading-relaxed text-[var(--text-dim)]">
        {error.message}
        {localFallback && (
          <span className="block text-[10.5px] text-[var(--text-mute)]">
            Showing local results.
          </span>
        )}
      </p>
      {onRetry && (
        <button type="button" onClick={onRetry} className="btn h-7 px-2.5 text-[10.5px]">
          <RefreshCw size={11} />
          Retry
        </button>
      )}
    </div>
  );
}

export function SpotifySearchSkeleton({
  variant = "page",
}: {
  variant?: "page" | "command";
}) {
  if (variant === "command") {
    return (
      <div
        className="space-y-1 p-1"
        role="status"
        aria-label="Searching"
        data-testid="spotify-search-loading"
      >
        {[0, 1, 2, 3].map((index) => (
          <div key={index} className="flex items-center gap-3 rounded-xl px-3 py-2.5">
            <div className="skeleton h-9 w-9 shrink-0 rounded-lg" />
            <div className="min-w-0 flex-1 space-y-1.5">
              <div className="skeleton h-2.5 w-2/5 rounded" />
              <div className="skeleton h-2 w-3/5 rounded" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div
      className="space-y-9"
      role="status"
      aria-label="Searching"
      data-testid="spotify-search-loading"
    >
      <section className="liquid rim rounded-2xl p-2">
        {[0, 1, 2, 3].map((index) => (
          <div key={index} className="flex items-center gap-3 px-2 py-2">
            <div className="skeleton h-10 w-10 shrink-0 rounded-lg" />
            <div className="min-w-0 flex-1 space-y-1.5">
              <div className="skeleton h-2.5 w-1/4 rounded" />
              <div className="skeleton h-2 w-1/3 rounded" />
            </div>
          </div>
        ))}
      </section>
      <section className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6">
        {[0, 1, 2, 3, 4].map((index) => (
          <div key={index} className="space-y-3">
            <div className="skeleton aspect-square rounded-2xl" />
            <div className="skeleton h-2.5 w-3/4 rounded" />
            <div className="skeleton h-2 w-1/2 rounded" />
          </div>
        ))}
      </section>
    </div>
  );
}
