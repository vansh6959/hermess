"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, Loader2, Play, Shuffle, X } from "lucide-react";
import { ArtworkImage } from "@/components/ui/ArtworkImage";
import { toSpotifyArtwork } from "@/lib/spotify/artwork";
import { formatTime } from "@/lib/utils";
import { useSpotifyPlaybackActions } from "@/components/providers/SpotifyPlaybackProvider";
import { AddToPlaylistButton } from "@/components/playlists/AddToPlaylistButton";
import { useFocusTrap } from "@/hooks/useFocusTrap";
import type { ListeningCover } from "@/hooks/useSpotifyCovers";
import type {
  SpotifyAlbumResult,
  SpotifyAlbumTracksData,
  SpotifyTrackResult,
} from "@/lib/spotify/types";
import type { SpotifyNowPlaying } from "@/lib/spotify/playback-types";
import {
  albumTracksKey,
  loadAlbumTracks,
  readAlbumTracks,
} from "@/lib/spotify/album-tracks";

type LoadState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; data: SpotifyAlbumTracksData };

function toNowPlaying(
  track: SpotifyTrackResult,
  album: SpotifyAlbumResult,
): SpotifyNowPlaying {
  return {
    id: track.id,
    name: track.name,
    artists: track.artists,
    albumName: album.name,
    imageUrl: track.imageUrl ?? album.imageUrl,
    durationMs: track.durationMs,
    spotifyUrl: track.spotifyUrl,
  };
}

export function CoverAlbumDialog({
  cover,
  onClose,
}: {
  cover: ListeningCover;
  onClose: () => void;
}) {
  const playback = useSpotifyPlaybackActions();
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useFocusTrap(true, panelRef);
  const [mounted, setMounted] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const albumKey = albumTracksKey(cover);
  const [state, setState] = useState<LoadState>(() => {
    const cached = albumKey ? readAlbumTracks(albumKey) : null;
    return cached ? { status: "ready", data: cached } : { status: "loading" };
  });

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!albumKey) {
      setState({ status: "error" });
      return;
    }
    if (attempt === 0) {
      const cached = readAlbumTracks(albumKey);
      if (cached) {
        setState({ status: "ready", data: cached });
        return;
      }
    }

    let active = true;
    setState({ status: "loading" });
    void loadAlbumTracks(cover, attempt > 0)
      .then((data) => {
        if (active) setState({ status: "ready", data });
      })
      .catch(() => {
        if (active) setState({ status: "error" });
      });

    return () => {
      active = false;
    };
  }, [albumKey, attempt, cover]);

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

  const data = state.status === "ready" ? state.data : null;
  const album = data?.album;
  const tracks = useMemo(
    () =>
      data
        ? data.tracks
            .filter((track) => Boolean(track?.id))
            .map((track) => toNowPlaying(track, data.album))
        : [],
    [data],
  );

  if (!mounted) return null;

  const title = album?.name ?? cover.title;
  const artist = album?.artists ?? cover.artist;
  const imageUrl = album?.imageUrl ?? cover.imageUrl;

  const playAll = () => {
    if (tracks.length === 0) return;
    playback.requestPlay({
      uris: tracks.map((track) => `spotify:track:${track.id}`),
      offset: 0,
      queue: tracks,
      queueIndex: 0,
      track: tracks[0],
      contextName: title,
    });
  };

  const shufflePlay = () => {
    if (tracks.length < 2) return;
    playback.requestPlay({
      uris: tracks.map((track) => `spotify:track:${track.id}`),
      offset: 0,
      queue: tracks,
      queueIndex: 0,
      track: tracks[0],
      shuffle: true,
      contextName: title,
    });
  };

  const playTrack = (index: number) => {
    const track = tracks[index];
    if (!track) return;
    playback.requestPlay({
      uris: [`spotify:track:${track.id}`],
      track,
    });
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
        aria-labelledby="cover-album-title"
        tabIndex={-1}
        className="liquid-raised rim grain relative flex max-h-[90dvh] w-full max-w-[760px] flex-col overflow-hidden rounded-t-[28px] outline-none animate-scale-in sm:max-h-[84vh] sm:rounded-[26px]"
      >
        <header className="flex items-start gap-3.5 border-b border-white/[0.07] px-4 py-4 sm:gap-4 sm:px-5">
          <div className="artwork-shell h-16 w-16 shrink-0 rounded-2xl sm:h-20 sm:w-20">
            <ArtworkImage
              artwork={toSpotifyArtwork(imageUrl, title)}
              alt=""
              loading="eager"
              sizes="80px"
              className="artwork-img"
            />
          </div>
          <div className="min-w-0 flex-1 pt-0.5">
            <p className="text-[9.5px] font-medium uppercase tracking-[0.22em] text-[var(--text-mute)]">
              Album
            </p>
            <h2
              id="cover-album-title"
              className="mt-1 truncate text-[16.5px] font-medium tracking-[-0.02em] text-white/95"
            >
              {title}
            </h2>
            <p className="mt-0.5 truncate text-[11.5px] text-[var(--text-mute)]">
              {artist}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close album"
            className="icon-btn h-8 w-8 shrink-0"
          >
            <X size={15} />
          </button>
        </header>

        {state.status === "loading" ? (
          <div
            className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5"
            aria-busy="true"
            aria-label="Loading album songs"
          >
            <div className="mb-3 flex items-center gap-2 text-[10.5px] text-[var(--text-mute)]">
              <Loader2 size={12} className="animate-spin" />
              Loading songs
            </div>
            <div className="space-y-2">
              {Array.from({ length: 7 }).map((_, index) => (
                <div key={index} className="skeleton h-11 rounded-lg" />
              ))}
            </div>
          </div>
        ) : state.status === "error" ? (
          <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
            <span className="grid h-10 w-10 place-items-center rounded-2xl border border-white/[0.08] bg-white/[0.03] text-[#e8b96a]">
              <AlertTriangle size={17} />
            </span>
            <p className="mt-3 text-[13px] font-medium text-white/85">
              Could not load this album
            </p>
            <button
              type="button"
              onClick={() => setAttempt((value) => value + 1)}
              className="btn mt-4 h-8 px-3 text-[11px]"
            >
              Retry
            </button>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between gap-4 px-4 pb-2 pt-3 sm:px-5">
              <p className="text-[10.5px] tabular-nums text-[var(--text-mute)]">
                {tracks.length} {tracks.length === 1 ? "song" : "songs"}
              </p>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={shufflePlay}
                  disabled={tracks.length < 2}
                  aria-label={`Shuffle ${title}`}
                  className="grid h-8 w-8 place-items-center rounded-full border border-white/[0.08] text-white/45 transition-colors hover:border-white/20 hover:text-white/85 disabled:opacity-35"
                >
                  <Shuffle size={12} />
                </button>
                <button
                  type="button"
                  onClick={playAll}
                  disabled={tracks.length === 0}
                  className="btn btn-accent h-8 gap-1.5 px-3.5 text-[11px] disabled:opacity-40"
                >
                  <Play size={11} fill="currentColor" />
                  Play all
                </button>
              </div>
            </div>
            <ul
              className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pb-4"
              aria-label={`${title} songs`}
            >
              {tracks.map((track, index) => (
                <li
                  key={`${track.id}-${index}`}
                  className="group flex items-center gap-1 rounded-xl transition-colors hover:bg-white/[0.045]"
                >
                  <button
                    type="button"
                    onClick={() => playTrack(index)}
                    aria-label={`Play ${track.name}`}
                    className="flex min-w-0 flex-1 items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors"
                  >
                    <span className="w-4 shrink-0 text-right text-[9.5px] tabular-nums text-white/25 group-hover:text-white/50">
                      {index + 1}
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
                      {formatTime(track.durationMs / 1000)}
                    </span>
                    <Play
                      size={11}
                      fill="currentColor"
                      className="shrink-0 text-white/30 transition-colors group-hover:text-[var(--acid)]"
                      aria-hidden
                    />
                  </button>
                  <AddToPlaylistButton track={track} className="mr-2" />
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
