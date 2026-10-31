import type { SpotifyNowPlaying } from "./playback-types";
import type { SpotifyTrackResult } from "./types";

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

async function loadTracks(url: string): Promise<SpotifyNowPlaying[]> {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error("Could not load the collection.");
  const payload = (await response.json()) as {
    tracks?: SpotifyTrackResult[];
  };
  const tracks = (payload.tracks ?? []).filter(
    (track): track is SpotifyTrackResult => Boolean(track?.id),
  );
  if (tracks.length === 0) throw new Error("The collection is empty.");
  return tracks.map(toNowPlaying);
}

export function loadAlbumQueue(albumId: string): Promise<SpotifyNowPlaying[]> {
  return loadTracks(
    `/api/spotify/album?album=${encodeURIComponent(albumId)}`,
  );
}

export function loadArtistQueue(
  artistId: string,
): Promise<SpotifyNowPlaying[]> {
  return loadTracks(`/api/spotify/artist?id=${encodeURIComponent(artistId)}`);
}
