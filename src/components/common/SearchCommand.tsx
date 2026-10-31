"use client";

import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { ArrowRight, ListPlus, Music2, Play } from "lucide-react";
import type { Artwork } from "@/lib/catalog/types";
import { toSpotifyArtwork } from "@/lib/spotify/artwork";
import { cn } from "@/lib/utils";
import { useUiStore } from "@/store/ui";
import { toast } from "@/store/toast";
import type { SpotifyNowPlaying } from "@/lib/spotify/playback-types";
import { loadAlbumQueue } from "@/lib/spotify/playback-collections";
import { ArtistDetailDialog } from "@/components/artist/ArtistDetailDialog";
import { AddToPlaylistButton } from "@/components/playlists/AddToPlaylistButton";
import type { PlaylistTrack } from "@/lib/spotify/playlist-types";
import { useSpotifySearch } from "@/hooks/useSpotifySearch";
import { useFocusTrap } from "@/hooks/useFocusTrap";
import {
  useSpotifyPlaybackActive,
  useSpotifyPlaybackActions,
} from "@/components/providers/SpotifyPlaybackProvider";
import {
  SpotifyNotice,
  SpotifySearchSkeleton,
} from "@/components/search/SpotifyResults";
import { ArtworkImage } from "@/components/ui/ArtworkImage";
import { LiquidSearch } from "@/components/ui/LiquidInput";

type ResultRow = {
  key: string;
  label: string;
  sub: string;
  artwork?: Artwork;
  playlistTrack?: PlaylistTrack;
  run: () => void;
  onQueue?: () => void;
};

export function SearchCommand() {
  const open = useUiStore((state) => state.isSearchOpen);
  const setOpen = useUiStore((state) => state.setSearchOpen);
  const playback = useSpotifyPlaybackActions();
  const playbackActive = useSpotifyPlaybackActive();
  const router = useRouter();

  const [mounted, setMounted] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [artistDetail, setArtistDetail] = useState<{
    id: string;
    name: string;
    imageUrl: string | null;
    genres: string[];
    spotifyUrl: string;
  } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const deferredQuery = useDeferredValue(query);
  const liveSpotify = useSpotifySearch(query);
  useFocusTrap(open, panelRef);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setActiveIndex(0);
      return;
    }
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const timer = window.setTimeout(() => inputRef.current?.focus(), 40);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previous;
      window.clearTimeout(timer);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, setOpen]);

  const spotifyRows = useMemo<ResultRow[]>(() => {
    if (!liveSpotify.data) return [];
    const close = () => setOpen(false);
    const tracks = liveSpotify.data.tracks;

    const startOrdered = (
      load: () => Promise<SpotifyNowPlaying[]>,
      label: string,
    ) => {
      void load()
        .then((queue) => {
          const first = queue[0];
          if (!first) throw new Error("The collection is empty.");
          playback.requestPlay({
            uris: queue.map((track) => `spotify:track:${track.id}`),
            offset: 0,
            queue,
            queueIndex: 0,
            track: first,
            contextName: label,
          });
        })
        .catch(() => toast(`Could not start ${label}.`, "error"));
    };

    return [
      ...tracks.slice(0, 4).map<ResultRow>((track) => ({
        key: `spotify-track-${track.id}`,
        label: track.name,
        sub: `${track.artists} · ${track.albumName}`,
        artwork: toSpotifyArtwork(track.imageUrl, track.name),
        playlistTrack: {
          id: track.id,
          name: track.name,
          artists: track.artists,
          albumName: track.albumName,
          imageUrl: track.imageUrl,
          durationMs: track.durationMs,
          spotifyUrl: track.spotifyUrl,
        },
        run: () => {
          close();
          playback.requestPlay({
            uris: [`spotify:track:${track.id}`],
            track: {
              id: track.id,
              name: track.name,
              artists: track.artists,
              albumName: track.albumName,
              imageUrl: track.imageUrl,
              durationMs: track.durationMs,
              spotifyUrl: track.spotifyUrl,
            },
          });
        },
        onQueue: playbackActive
          ? () => {
              close();
              void playback.queueTrack({
                id: track.id,
                name: track.name,
                artists: track.artists,
                albumName: track.albumName,
                imageUrl: track.imageUrl,
                durationMs: track.durationMs,
                spotifyUrl: track.spotifyUrl,
              });
            }
          : undefined,
      })),
      ...liveSpotify.data.albums.slice(0, 3).map<ResultRow>((album) => ({
        key: `spotify-album-${album.id}`,
        label: album.name,
        sub: `${album.artists}${album.releaseYear ? ` · ${album.releaseYear}` : ""}`,
        artwork: toSpotifyArtwork(album.imageUrl, album.name),
        run: () => {
          close();
          startOrdered(() => loadAlbumQueue(album.id), album.name);
        },
      })),
      ...liveSpotify.data.artists.slice(0, 3).map<ResultRow>((artist) => ({
        key: `spotify-artist-${artist.id}`,
        label: artist.name,
        sub: artist.genres[0] ?? "Artist",
        artwork: toSpotifyArtwork(artist.imageUrl, artist.name),
        run: () => {
          close();
          setArtistDetail({
            id: artist.id,
            name: artist.name,
            imageUrl: artist.imageUrl,
            genres: artist.genres,
            spotifyUrl: artist.spotifyUrl,
          });
        },
      })),
    ];
  }, [liveSpotify.data, playback, playbackActive, setOpen]);

  const trimmed = query.trim();
  const deferredTrimmed = deferredQuery.trim();
  const hasQuery = deferredTrimmed.length >= 2;
  const spotifyLoading = liveSpotify.status === "loading";
  const spotifyError = liveSpotify.status === "error" ? liveSpotify.error : null;
  const showLoading =
    trimmed.length >= 2 &&
    !liveSpotify.data &&
    (spotifyLoading || liveSpotify.status === "idle");
  const showNotice = spotifyError !== null && trimmed.length >= 2;
  const rows = spotifyRows;
  const canActivate = !showLoading && rows.length > 0;

  useEffect(() => {
    setActiveIndex(0);
  }, [deferredQuery, liveSpotify.status, rows.length]);

  useEffect(() => {
    if (!open) return;
    document
      .getElementById(`search-row-${activeIndex}`)
      ?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, open]);

  if (!mounted) return null;

  const artistDialog = artistDetail ? (
    <ArtistDetailDialog
      artistId={artistDetail.id}
      artistName={artistDetail.name}
      localProfile={{
        imageUrl: artistDetail.imageUrl,
        genres: artistDetail.genres,
        spotifyUrl: artistDetail.spotifyUrl,
      }}
      onClose={() => setArtistDetail(null)}
    />
  ) : null;

  if (!open) return artistDialog;

  const activateRow = (row: ResultRow) => {
    row.run();
  };

  const viewAllResults = () => {
    const q = query.trim();
    if (!q) return;
    setOpen(false);
    router.push(`/search?q=${encodeURIComponent(q)}`);
  };

  const onInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => Math.min(index + 1, Math.max(rows.length - 1, 0)));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => Math.max(index - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (!canActivate) return;
      const row = rows[activeIndex];
      if (row) activateRow(row);
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[95] overflow-y-auto bg-black/70 px-3 pt-[8vh] backdrop-blur-md sm:px-6 sm:pt-[12vh]"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) setOpen(false);
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Search Hermes"
    >
      <div
        ref={panelRef}
        className={cn(
          "animate-scale-in mx-auto w-full max-w-2xl overflow-hidden rounded-[26px]",
          hasQuery && "liquid-raised rim grain shadow-2xl",
        )}
      >
        <div className="p-3 sm:p-4">
          <LiquidSearch
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onClear={() => setQuery("")}
            onKeyDown={onInputKeyDown}
            maxLength={100}
            placeholder="Search songs, artists, albums"
            aria-label="Search songs, artists and albums on Spotify"
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={hasQuery && rows.length > 0}
            aria-controls="hermes-search-results"
            aria-activedescendant={
              rows.length > 0 ? `search-row-${activeIndex}` : undefined
            }
            autoComplete="off"
            spellCheck={false}
            loading={showLoading}
            className="text-[14px]"
            trailing={
              <kbd className="hidden shrink-0 items-center rounded-md border border-white/10 bg-white/[0.04] px-1.5 py-1 text-[9.5px] text-white/40 sm:flex">
                ESC
              </kbd>
            }
          />
          {trimmed.length === 1 && (
            <p className="px-1 pt-2 text-[10px] text-[var(--text-mute)]">
              Type one more character to search.
            </p>
          )}
        </div>

        {hasQuery ? (
          <div className="max-h-[60vh] overflow-y-auto px-2 pb-2">
            {showLoading && <SpotifySearchSkeleton variant="command" />}

            {!showLoading && (
              <>
                {showNotice && spotifyError && (
                  <div className="px-1 pb-2">
                    <SpotifyNotice
                      error={spotifyError}
                      onRetry={liveSpotify.retry}
                      compact
                    />
                  </div>
                )}

                {rows.length > 0 ? (
                  <>
                    <div
                      id="hermes-search-results"
                      role="listbox"
                      aria-label="Search results"
                    >
                      {rows.map((row, index) => {
                      const content = (
                        <>
                          <span className="artwork-shell h-9 w-9 shrink-0 rounded-lg">
                            {row.artwork?.src ? (
                              <ArtworkImage
                                artwork={row.artwork}
                                alt=""
                                loading="lazy"
                                sizes="36px"
                              />
                            ) : (
                              <span className="grid h-full w-full place-items-center bg-white/[0.06]">
                                <Music2 size={14} className="text-white/40" />
                              </span>
                            )}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[13px] font-medium text-white">
                              {row.label}
                            </span>
                            <span className="block truncate text-[11px] text-[var(--text-mute)]">
                              {row.sub}
                            </span>
                          </span>
                          {(row.onQueue || row.playlistTrack) && (
                            <Play
                              size={11}
                              fill="currentColor"
                              className={cn(
                                "shrink-0 transition-colors",
                                index === activeIndex
                                  ? "text-[#8df0ad]"
                                  : "text-white/25",
                              )}
                              aria-hidden
                            />
                          )}
                        </>
                      );

                      const rowClassName =
                        "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--acid)]";
                      const rowSurface =
                        index === activeIndex
                          ? "bg-white/[0.08]"
                          : "hover:bg-white/[0.045]";

                      if (row.onQueue || row.playlistTrack) {
                        return (
                          <div
                            key={row.key}
                            onMouseEnter={() => setActiveIndex(index)}
                            className={cn(
                              "flex items-center gap-1 rounded-xl pr-1.5 transition-colors",
                              rowSurface,
                            )}
                          >
                            <button
                              type="button"
                              id={`search-row-${index}`}
                              role="option"
                              aria-selected={index === activeIndex}
                              onClick={row.run}
                              className={rowClassName}
                            >
                              {content}
                            </button>
                            {row.onQueue ? (
                              <button
                                type="button"
                                onClick={row.onQueue}
                                aria-label={`Add ${row.label} to queue`}
                                className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-white/40 transition hover:bg-white/10 hover:text-[#8df0ad]"
                              >
                                <ListPlus size={14} aria-hidden />
                              </button>
                            ) : null}
                            {row.playlistTrack ? (
                              <AddToPlaylistButton
                                track={row.playlistTrack}
                                onOpen={() => setOpen(false)}
                              />
                            ) : null}
                          </div>
                        );
                      }

                      return (
                        <button
                          key={row.key}
                          id={`search-row-${index}`}
                          type="button"
                          role="option"
                          aria-selected={index === activeIndex}
                          onMouseEnter={() => setActiveIndex(index)}
                          onClick={row.run}
                          className={cn(rowClassName, rowSurface)}
                        >
                          {content}
                        </button>
                      );
                    })}
                    </div>
                    <button
                      type="button"
                      onClick={viewAllResults}
                      className="mt-1 flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left text-[11px] text-[var(--text-mute)] transition hover:bg-white/[0.045] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--acid)]"
                    >
                      <span className="truncate">
                        View all results for “{query.trim()}”
                      </span>
                      <ArrowRight size={12} aria-hidden className="shrink-0" />
                    </button>
                    <span className="sr-only" aria-live="polite">
                      {rows.length} {rows.length === 1 ? "result" : "results"}
                    </span>
                  </>
                ) : (
                  !showNotice && (
                    <div className="px-4 py-14 text-center">
                      <p className="text-[13.5px] font-medium text-white">
                        Nothing matched “{deferredQuery}”
                      </p>
                    </div>
                  )
                )}
              </>
            )}
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
