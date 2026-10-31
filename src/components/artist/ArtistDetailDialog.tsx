"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  AlertTriangle,
  Play,
  Shuffle,
  X,
} from "lucide-react";
import { ArtworkImage } from "@/components/ui/ArtworkImage";
import { useSpotifyPlaybackActions } from "@/components/providers/SpotifyPlaybackProvider";
import { useFocusTrap } from "@/hooks/useFocusTrap";
import { useArtworkPalette, paletteStyle } from "@/lib/palette";
import {
  spotifyFallbackPalette,
  toSpotifyArtwork,
} from "@/lib/spotify/artwork";
import { loadAlbumQueue } from "@/lib/spotify/playback-collections";
import type {
  SpotifyAlbumResult,
  SpotifyArtistDetail,
  SpotifyTrackResult,
} from "@/lib/spotify/types";
import type { SpotifyNowPlaying } from "@/lib/spotify/playback-types";
import type { ImportedTrack } from "@/lib/import/types";
import { formatCount } from "@/lib/utils";
import {
  SpotifyAlbumCard,
  SpotifyTrackRow,
} from "@/components/search/SpotifyResults";
import { toast } from "@/store/toast";

function toNowPlaying(track: SpotifyTrackResult): SpotifyNowPlaying {
  return {
    id: track.id,
    name: track.name,
    artists: track.artists,
    albumName: track.albumName,
    imageUrl: track.imageUrl,
    durationMs: track.durationMs,
    spotifyUrl: track.spotifyUrl,
  };
}

function importedToNowPlaying(track: ImportedTrack): SpotifyNowPlaying {
  return {
    id: track.id,
    name: track.name,
    artists: track.artists,
    albumName: track.albumName,
    imageUrl: track.imageUrl,
    durationMs: track.durationMs,
    spotifyUrl: track.url ?? `https://open.spotify.com/track/${track.id}`,
  };
}

interface LocalArtistAlbum {
  key: string;
  name: string;
  imageUrl: string | null;
  tracks: ImportedTrack[];
}

function buildLocalArtist(
  name: string,
  localTracks: ImportedTrack[],
  profile?: { imageUrl?: string | null; genres?: string[]; spotifyUrl?: string },
): { detail: SpotifyArtistDetail; albums: LocalArtistAlbum[] } | null {
  const tracks = localTracks.filter(
    (track) => track?.id && (track.source === "spotify" || Boolean(track.url)),
  );
  if (tracks.length === 0 && !profile?.imageUrl) return null;

  const albumMap = new Map<string, LocalArtistAlbum>();
  for (const track of tracks) {
    const albumName = track.albumName?.trim() || "Unknown album";
    const key = albumName.toLowerCase();
    const existing = albumMap.get(key);
    if (existing) {
      if (!existing.tracks.some((item) => item.id === track.id)) {
        existing.tracks.push(track);
      }
      if (!existing.imageUrl && track.imageUrl) existing.imageUrl = track.imageUrl;
      continue;
    }
    albumMap.set(key, {
      key,
      name: albumName,
      imageUrl: track.imageUrl,
      tracks: [track],
    });
  }

  const topTracks = tracks.slice(0, 5).map((track) => ({
    id: track.id,
    name: track.name,
    artists: track.artists,
    albumName: track.albumName,
    imageUrl: track.imageUrl,
    durationMs: track.durationMs,
    explicit: false,
    spotifyUrl:
      track.url ?? `https://open.spotify.com/track/${track.id}`,
  }));

  return {
    detail: {
      artist: {
        id: "",
        name,
        imageUrl:
          profile?.imageUrl ?? tracks.find((track) => track.imageUrl)?.imageUrl ?? null,
        followers: null,
        genres: profile?.genres ?? [],
        popularity: null,
        spotifyUrl: profile?.spotifyUrl ?? "",
      },
      albums: [],
      singles: [],
      topTracks,
    },
    albums: [...albumMap.values()],
  };
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[9px] uppercase tracking-[0.18em] text-white/30">
        {label}
      </p>
      <p className="mt-1 truncate text-[13px] font-medium text-white/85">
        {value}
      </p>
    </div>
  );
}

export function ArtistDetailDialog({
  artistId,
  artistName,
  localTracks,
  localProfile,
  onClose,
}: {
  artistId?: string;
  artistName?: string;
  localTracks?: ImportedTrack[];
  localProfile?: {
    imageUrl?: string | null;
    genres?: string[];
    spotifyUrl?: string;
  };
  onClose: () => void;
}) {
  const playback = useSpotifyPlaybackActions();
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useFocusTrap(true, panelRef);

  const [mounted, setMounted] = useState(false);
  const [data, setData] = useState<SpotifyArtistDetail | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [playingAlbumId, setPlayingAlbumId] = useState<string | null>(null);
  const [fallback, setFallback] = useState(false);
  const [localAlbums, setLocalAlbums] = useState<LocalArtistAlbum[]>([]);
  const localTracksRef = useRef(localTracks);
  const localProfileRef = useRef(localProfile);
  localTracksRef.current = localTracks;
  localProfileRef.current = localProfile;

  const palette = useArtworkPalette(
    data?.artist.imageUrl ?? undefined,
    spotifyFallbackPalette,
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

  useEffect(() => {
    const params = new URLSearchParams();
    if (artistId) params.set("id", artistId);
    else if (artistName) params.set("name", artistName);
    else {
      setStatus("error");
      setError("No artist was selected.");
      return;
    }

    const controller = new AbortController();
    let cancelled = false;
    let timedOut = false;
    const timer = window.setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, 6_500);
    setStatus("loading");
    setError(null);
    setFallback(false);
    setLocalAlbums([]);

    fetch(`/api/spotify/artist-detail?${params.toString()}`, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
      cache: "no-store",
    })
      .then(async (response) => {
        const payload = (await response.json().catch(() => null)) as
          | SpotifyArtistDetail
          | { error?: { message?: string } }
          | null;
        if (!response.ok) {
          const message =
            payload && "error" in payload
              ? payload.error?.message
              : null;
          throw new Error(
            response.status === 429
              ? "Spotify is rate-limiting artist details right now."
              : message ?? "Artist details could not be loaded.",
          );
        }
        return payload as SpotifyArtistDetail;
      })
      .then((payload) => {
        window.clearTimeout(timer);
        if (cancelled) return;
        setData(payload);
        setFallback(false);
        setLocalAlbums([]);
        setStatus("ready");
      })
      .catch((loadError: unknown) => {
        window.clearTimeout(timer);
        if (cancelled) return;
        const message = timedOut
          ? "Spotify took too long to respond."
          : loadError instanceof Error
            ? loadError.message
            : "Artist details could not be loaded.";
        const local = buildLocalArtist(
          artistName ?? "Artist",
          localTracksRef.current ?? [],
          localProfileRef.current,
        );
        if (local) {
          setData(local.detail);
          setLocalAlbums(local.albums);
          setFallback(true);
          setError(message);
          setStatus("ready");
          return;
        }
        setStatus("error");
        setError(message);
      });

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [artistId, artistName, attempt]);

  if (!mounted) return null;

  const playTopTracks = (shuffle = false) => {
    const tracks = data?.topTracks ?? [];
    if (tracks.length === 0) return;
    playback.requestPlay({
      uris: tracks.map((track) => `spotify:track:${track.id}`),
      offset: 0,
      queue: tracks.map(toNowPlaying),
      queueIndex: 0,
      track: toNowPlaying(tracks[0]),
      shuffle,
      contextName: data?.artist.name ?? artistName ?? "Top tracks",
    });
  };

  const playTrack = (track: SpotifyTrackResult) => {
    playback.requestPlay({
      uris: [`spotify:track:${track.id}`],
      track: toNowPlaying(track),
    });
  };

  const playAlbum = async (album: SpotifyAlbumResult) => {
    if (playingAlbumId) return;
    setPlayingAlbumId(album.id);
    try {
      const queue = await loadAlbumQueue(album.id);
      if (!queue[0]) throw new Error("The album is empty.");
      playback.requestPlay({
        uris: queue.map((track) => `spotify:track:${track.id}`),
        offset: 0,
        queue,
        queueIndex: 0,
        track: queue[0],
        contextName: album.name,
      });
    } catch {
      toast("Could not start that album.", "error");
    } finally {
      setPlayingAlbumId(null);
    }
  };

  const playLocalAlbum = (album: LocalArtistAlbum) => {
    const queue = album.tracks
      .filter((track) => track.id && track.source === "spotify")
      .map(importedToNowPlaying);
    if (queue.length === 0) return;
    playback.requestPlay({
      uris: queue.map((track) => `spotify:track:${track.id}`),
      offset: 0,
      queue,
      queueIndex: 0,
      track: queue[0],
      contextName: album.name,
    });
  };

  const artist = data?.artist;
  const label = artist?.name ?? artistName ?? "Artist";
  const followers =
    artist?.followers == null ? null : formatCount(artist.followers);
  const hasTopTracks = Boolean(data?.topTracks.length);
  const localSongCount = localAlbums.reduce(
    (total, album) => total + album.tracks.length,
    0,
  );
  const hasLocalLibrary = localSongCount > 0;
  const hasReleases = fallback
    ? localAlbums.length > 0
    : Boolean((data?.albums.length ?? 0) + (data?.singles.length ?? 0));

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-black/70 backdrop-blur-sm animate-fade-in sm:items-center sm:px-4 sm:py-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={`${label} artist`}
        tabIndex={-1}
        className="flex w-full max-w-[920px] flex-col outline-none"
      >
        <div
          className="library-panel-enter liquid library-panel rim grain relative z-20 flex max-h-[calc(100dvh_-_2rem)] w-full flex-col overflow-hidden rounded-[26px] shadow-[0_36px_100px_-32px_rgba(0,0,0,0.95)] sm:max-h-[calc(100dvh_-_6rem)]"
          style={paletteStyle(palette)}
        >
          <button
            type="button"
            onClick={onClose}
            aria-label={`Close ${label} artist`}
            className="absolute right-3 top-3 z-30 grid h-8 w-8 place-items-center rounded-full border border-white/10 bg-black/45 text-white/60 backdrop-blur-md transition-colors hover:border-white/20 hover:text-white"
          >
            <X size={14} />
          </button>

          {status === "loading" ? (
            <div className="flex min-h-[420px] flex-col gap-4 p-6">
              <div className="flex items-end gap-5">
                <div className="skeleton h-32 w-32 rounded-full" />
                <div className="flex-1 space-y-2">
                  <div className="skeleton h-3 w-16 rounded-full" />
                  <div className="skeleton h-8 w-56 rounded-full" />
                  <div className="skeleton h-3 w-40 rounded-full" />
                </div>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
                {Array.from({ length: 4 }).map((_, index) => (
                  <div key={index} className="skeleton aspect-square rounded-2xl" />
                ))}
              </div>
            </div>
          ) : status === "error" ? (
            <div className="flex min-h-[320px] flex-col items-center justify-center gap-3 px-6 py-12 text-center">
              <AlertTriangle size={20} className="text-[#e8b96a]" />
              <h3 className="text-[1.1rem] font-medium text-white">
                Could not load {label}
              </h3>
              <p className="max-w-[340px] text-[11.5px] leading-relaxed text-[var(--text-mute)]">
                {error ?? "Artist details are unavailable right now."}
              </p>
              <div className="mt-1 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setAttempt((value) => value + 1)}
                  className="btn h-8 px-3 text-[11px]"
                >
                  Try again
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="btn h-8 px-3 text-[11px]"
                >
                  Close
                </button>
              </div>
            </div>
          ) : data ? (
            <div className="library-song-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain">
              <div className="relative overflow-hidden px-5 pb-6 pt-9 sm:px-7">
                <div
                  className="absolute inset-0 scale-125 bg-cover bg-center opacity-35 blur-3xl"
                  style={
                    artist?.imageUrl
                      ? { backgroundImage: `url(${artist.imageUrl})` }
                      : undefined
                  }
                  aria-hidden
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#06070a] via-[#06070a]/50 to-transparent" />
                <div className="relative flex flex-col gap-5 sm:flex-row sm:items-end">
                  <div className="artwork-shell h-32 w-32 shrink-0 overflow-hidden rounded-full shadow-[0_30px_70px_-30px_rgba(0,0,0,0.95)] sm:h-36 sm:w-36">
                    <ArtworkImage
                      artwork={{
                        src: artist?.imageUrl ?? "",
                        alt: label,
                        palette,
                      }}
                      alt={label}
                      loading="eager"
                      sizes="144px"
                      className="artwork-img"
                    />
                  </div>
                  <div className="min-w-0 pb-1">
                    <p className="text-[9px] uppercase tracking-[0.24em] text-white/45">
                      Artist
                    </p>
                    <h2 className="mt-1 truncate text-[2rem] font-semibold leading-none tracking-[-0.05em] text-white sm:text-[2.6rem]">
                      {label}
                    </h2>
                    <p className="mt-2 text-[11px] text-white/55">
                      {followers
                        ? `${followers} followers`
                        : fallback
                          ? hasLocalLibrary
                            ? "From your imported library"
                            : "Spotify artist"
                          : "Spotify artist"}
                      {artist?.genres.length
                        ? ` · ${artist.genres.slice(0, 3).join(" · ")}`
                        : ""}
                    </p>
                    <div className="mt-4 flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => playTopTracks(false)}
                        disabled={!hasTopTracks}
                        className="btn btn-accent h-9 px-4 text-[11.5px] disabled:opacity-40"
                      >
                        <Play size={13} fill="currentColor" />
                        Play
                      </button>
                      <button
                        type="button"
                        onClick={() => playTopTracks(true)}
                        disabled={!hasTopTracks}
                        className="btn h-9 px-3.5 text-[11.5px] disabled:opacity-40"
                      >
                        <Shuffle size={13} />
                        Shuffle
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="px-5 pb-8 sm:px-7">
                {fallback ? (
                  <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-[#e8b96a]/20 bg-[#e8b96a]/[0.06] px-3 py-2 text-[10.5px] leading-relaxed text-[#e8c98a]">
                    <AlertTriangle size={13} className="shrink-0" />
                    <span className="min-w-0 flex-1">
                      {error ?? "Spotify details are temporarily unavailable."}{" "}
                      Showing{" "}
                      {hasLocalLibrary
                        ? "your imported library"
                        : "the artist profile we already have"}
                      .
                    </span>
                    <button
                      type="button"
                      onClick={() => setAttempt((value) => value + 1)}
                      className="btn h-7 px-2.5 text-[10px]"
                    >
                      Retry
                    </button>
                  </div>
                ) : null}

                {hasTopTracks ? (
                  <section>
                    <h3 className="mb-2.5 text-[10px] font-medium uppercase tracking-[0.24em] text-[var(--text-mute)]">
                      Popular
                    </h3>
                    <div className="liquid rim rounded-2xl p-1.5">
                      {data.topTracks.slice(0, 5).map((track) => (
                        <SpotifyTrackRow
                          key={track.id}
                          track={track}
                          onPlay={() => playTrack(track)}
                        />
                      ))}
                    </div>
                  </section>
                ) : null}

                {fallback ? (
                  localAlbums.length > 0 ? (
                    <section className={hasTopTracks ? "mt-8" : ""}>
                      <h3 className="mb-3 text-[10px] font-medium uppercase tracking-[0.24em] text-[var(--text-mute)]">
                        Albums in your library
                      </h3>
                      <div className="grid grid-cols-2 gap-x-3.5 gap-y-6 sm:grid-cols-3 lg:grid-cols-4">
                        {localAlbums.map((album) => (
                          <button
                            key={album.key}
                            type="button"
                            onClick={() => playLocalAlbum(album)}
                            aria-label={`Play ${album.name}`}
                            className="group block w-full text-left focus-visible:outline-none"
                          >
                            <div className="artwork-shell artwork-hover relative aspect-square">
                              <ArtworkImage
                                artwork={toSpotifyArtwork(
                                  album.imageUrl,
                                  album.name,
                                )}
                                alt=""
                                loading="lazy"
                                className="artwork-img"
                              />
                              <span className="pointer-events-none absolute bottom-2.5 right-2.5 z-[2] grid h-8 w-8 place-items-center rounded-full bg-[var(--acid)] text-[#10140a] opacity-0 shadow-lg transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                                <Play
                                  size={14}
                                  fill="currentColor"
                                  className="ml-0.5"
                                />
                              </span>
                            </div>
                            <div className="mt-3 px-0.5">
                              <h4 className="truncate text-[13.5px] font-semibold tracking-tight text-white">
                                {album.name}
                              </h4>
                              <p className="mt-0.5 truncate text-[12px] text-[var(--text-mute)]">
                                {album.tracks.length}{" "}
                                {album.tracks.length === 1 ? "song" : "songs"}
                              </p>
                            </div>
                          </button>
                        ))}
                      </div>
                    </section>
                  ) : null
                ) : (
                  <>
                    {data.albums.length > 0 ? (
                      <section className={hasTopTracks ? "mt-8" : ""}>
                        <h3 className="mb-3 text-[10px] font-medium uppercase tracking-[0.24em] text-[var(--text-mute)]">
                          Albums
                        </h3>
                        <div className="grid grid-cols-2 gap-x-3.5 gap-y-6 sm:grid-cols-3 lg:grid-cols-4">
                          {data.albums.map((album) => (
                            <SpotifyAlbumCard
                              key={album.id}
                              album={album}
                              onPlay={() => void playAlbum(album)}
                              className="w-full"
                            />
                          ))}
                        </div>
                      </section>
                    ) : null}

                    {data.singles.length > 0 ? (
                      <section className="mt-8">
                        <h3 className="mb-3 text-[10px] font-medium uppercase tracking-[0.24em] text-[var(--text-mute)]">
                          Singles and EPs
                        </h3>
                        <div className="grid grid-cols-2 gap-x-3.5 gap-y-6 sm:grid-cols-3 lg:grid-cols-4">
                          {data.singles.map((album) => (
                            <SpotifyAlbumCard
                              key={album.id}
                              album={album}
                              onPlay={() => void playAlbum(album)}
                              className="w-full"
                            />
                          ))}
                        </div>
                      </section>
                    ) : null}

                    {!hasReleases ? (
                      <p className="mt-8 rounded-2xl border border-white/[0.07] bg-white/[0.025] px-4 py-6 text-center text-[11.5px] text-[var(--text-mute)]">
                        No releases were found for this artist on Spotify.
                      </p>
                    ) : null}
                  </>
                )}

                <section className="mt-8">
                  <h3 className="mb-2.5 text-[10px] font-medium uppercase tracking-[0.24em] text-[var(--text-mute)]">
                    About
                  </h3>
                  <div className="liquid rim rounded-2xl px-4 py-4 sm:px-5 sm:py-5">
                    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                      {fallback ? (
                        hasLocalLibrary ? (
                          <>
                            <Fact label="Songs" value={String(localSongCount)} />
                            <Fact
                              label="Albums"
                              value={String(localAlbums.length)}
                            />
                            <Fact label="Source" value="Your library" />
                            <Fact
                              label="Spotify"
                              value={error ? "Temporarily unavailable" : "—"}
                            />
                          </>
                        ) : (
                          <>
                            <Fact label="Profile" value="Spotify search" />
                            <Fact label="Details" value="Temporarily unavailable" />
                            <Fact label="Source" value="Spotify" />
                            <Fact
                              label="Genres"
                              value={
                                artist?.genres.length
                                  ? String(artist.genres.length)
                                  : "—"
                              }
                            />
                          </>
                        )
                      ) : (
                        <>
                          <Fact label="Followers" value={followers ?? "—"} />
                          <Fact
                            label="Albums"
                            value={String(data.albums.length)}
                          />
                          <Fact
                            label="Singles and EPs"
                            value={String(data.singles.length)}
                          />
                          <Fact
                            label="Spotify popularity"
                            value={
                              artist?.popularity == null
                                ? "—"
                                : `${artist.popularity}/100`
                            }
                          />
                        </>
                      )}
                    </div>
                    {artist?.genres.length ? (
                      <div className="mt-4 flex flex-wrap gap-1.5">
                        {artist.genres.map((genre) => (
                          <span
                            key={genre}
                            className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[10px] text-white/60"
                          >
                            {genre}
                          </span>
                        ))}
                      </div>
                    ) : null}
                    <p className="mt-4 text-[10.5px] leading-relaxed text-[var(--text-mute)]">
                      {fallback
                        ? hasLocalLibrary
                          ? "Spotify details are temporarily unavailable. Showing the albums and songs in your imported library; retry to load the full artist profile."
                          : "Spotify details are temporarily unavailable. Showing the artist profile we already have; retry to load albums and popularity."
                        : "Artist profile, releases and popularity come from Spotify."}
                    </p>
                  </div>
                </section>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>,
    document.body,
  );
}
