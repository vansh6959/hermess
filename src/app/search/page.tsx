"use client";

import { useDeferredValue, useEffect, useState } from "react";
import { SearchX } from "lucide-react";
import { usePageTitle } from "@/hooks/useEnvironment";
import { useSpotifySearch } from "@/hooks/useSpotifySearch";
import {
  useSpotifyPlaybackActive,
  useSpotifyPlaybackActions,
} from "@/components/providers/SpotifyPlaybackProvider";
import { LiquidSearch } from "@/components/ui/LiquidInput";
import { EmptyState } from "@/components/ui/States";
import type {
  SpotifyAlbumResult,
  SpotifyArtistResult,
  SpotifyTrackResult,
} from "@/lib/spotify/types";
import type { SpotifyNowPlaying } from "@/lib/spotify/playback-types";
import { loadAlbumQueue } from "@/lib/spotify/playback-collections";
import { ArtistDetailDialog } from "@/components/artist/ArtistDetailDialog";
import { toast } from "@/store/toast";
import {
  SpotifyAlbumCard,
  SpotifyArtistCard,
  SpotifyNotice,
  SpotifySearchSkeleton,
  SpotifyTrackRow,
} from "@/components/search/SpotifyResults";

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

export default function SearchPage() {
  usePageTitle("Search");
  const [query, setQuery] = useState("");
  const [artistDetail, setArtistDetail] = useState<SpotifyArtistResult | null>(
    null,
  );
  const deferred = useDeferredValue(query);
  const spotify = useSpotifySearch(query);
  const playback = useSpotifyPlaybackActions();
  const playbackActive = useSpotifyPlaybackActive();

  useEffect(() => {
    const initial = new URLSearchParams(window.location.search).get("q");
    if (initial) setQuery(initial.slice(0, 100));
  }, []);

  const trimmed = deferred.trim();
  const hasQuery = trimmed.length > 0;
  const spotifyEligible = query.trim().length >= 2;
  const spotifyLoading =
    spotifyEligible &&
    (spotify.status === "loading" || spotify.status === "idle");
  const spotifyData = spotify.data;
  const showSkeleton = spotifyLoading && !spotifyData;
  const showingCurrent =
    spotifyData?.query.trim().toLowerCase() === query.trim().toLowerCase();
  const spotifyError = spotify.status === "error" ? spotify.error : null;
  const spotifyTotal = spotifyData
    ? spotifyData.tracks.length + spotifyData.albums.length + spotifyData.artists.length
    : 0;

  const playTrack = (index: number) => {
    if (!spotifyData) return;
    const track = spotifyData.tracks[index];
    if (!track) return;
    playback.requestPlay({
      uris: [`spotify:track:${track.id}`],
      track: toNowPlaying(track),
    });
  };

  const queueTrack = (index: number) => {
    if (!spotifyData) return;
    const track = spotifyData.tracks[index];
    if (!track) return;
    void playback.queueTrack(toNowPlaying(track));
  };

  const playAlbum = (album: SpotifyAlbumResult) => {
    void loadAlbumQueue(album.id)
      .then((queue) => {
        const first = queue[0];
        if (!first) throw new Error("The album is empty.");
        playback.requestPlay({
          uris: queue.map((track) => `spotify:track:${track.id}`),
          offset: 0,
          queue,
          queueIndex: 0,
          track: first,
          contextName: album.name,
        });
      })
      .catch(() => toast("Could not start that album.", "error"));
  };

  return (
    <div className="space-y-8">
      <header className="flex items-end justify-between gap-4">
        <h1 className="text-[2rem] font-medium leading-none tracking-[-0.045em] text-white/90 sm:text-[2.6rem]">
          Search
        </h1>
      </header>

      <div className="max-w-[720px]">
        <LiquidSearch
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onClear={() => setQuery("")}
          loading={spotifyLoading}
          maxLength={100}
          placeholder="Search songs, artists, albums"
          aria-label="Search songs, artists and albums on Spotify"
          containerClassName="animate-fade-in"
          className="text-[14px]"
        />
        {query.trim().length === 1 && (
          <p className="mt-2 px-1 text-[11px] text-[var(--text-mute)]">
            Type one more character to search.
          </p>
        )}
      </div>

      {showSkeleton && <SpotifySearchSkeleton />}

      {spotifyData && (
        <>
          {spotifyTotal === 0 && showingCurrent ? (
            <EmptyState
              icon={<SearchX size={20} />}
              title={`No results for “${trimmed}”`}
            />
          ) : spotifyTotal === 0 ? null : (
            <div className="space-y-9">
              {spotifyData.tracks.length > 0 && (
                <section>
                  <h2 className="mb-3 text-[13px] font-semibold text-white">
                    Songs <span className="ml-1 text-[10px] font-normal text-white/30">{spotifyData.tracks.length}</span>
                  </h2>
                  <div className="liquid rim rounded-2xl p-2">
                    {spotifyData.tracks.map((track, index) => (
                      <SpotifyTrackRow
                        key={track.id}
                        track={track}
                        onPlay={() => playTrack(index)}
                        onQueue={
                          playbackActive
                            ? () => queueTrack(index)
                            : undefined
                        }
                      />
                    ))}
                  </div>
                </section>
              )}

              {spotifyData.albums.length > 0 && (
                <section>
                  <h2 className="mb-3 text-[13px] font-semibold text-white">
                    Albums <span className="ml-1 text-[10px] font-normal text-white/30">{spotifyData.albums.length}</span>
                  </h2>
                  <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6">
                    {spotifyData.albums.map((album) => (
                      <SpotifyAlbumCard
                        key={album.id}
                        album={album}
                        onPlay={() => playAlbum(album)}
                      />
                    ))}
                  </div>
                </section>
              )}

              {spotifyData.artists.length > 0 && (
                <section>
                  <h2 className="mb-3 text-[13px] font-semibold text-white">
                    Artists <span className="ml-1 text-[10px] font-normal text-white/30">{spotifyData.artists.length}</span>
                  </h2>
                  <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-6">
                    {spotifyData.artists.map((artist) => (
                      <SpotifyArtistCard
                        key={artist.id}
                        artist={artist}
                        onOpen={() => setArtistDetail(artist)}
                      />
                    ))}
                  </div>
                </section>
              )}
            </div>
          )}
        </>
      )}

      {hasQuery && spotifyError && (
        <SpotifyNotice error={spotifyError} onRetry={spotify.retry} />
      )}

      {artistDetail ? (
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
      ) : null}
    </div>
  );
}
