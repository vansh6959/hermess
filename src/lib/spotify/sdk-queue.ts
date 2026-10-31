import type { SpotifyNowPlaying } from "./playback-types";

export interface SdkQueueTrack {
  id: string | null;
  uri?: string;
  name: string;
  artists?: Array<{ name: string }>;
  album?: { name?: string; images?: Array<{ url: string }> };
  show?: { name?: string; images?: Array<{ url: string }> };
}

function spotifyUrl(track: SdkQueueTrack) {
  const kind =
    track.uri?.includes(":episode:") || (!track.album && track.show)
      ? "episode"
      : "track";
  return `https://open.spotify.com/${kind}/${track.id}`;
}

export function nextQueueFromSdk({
  current,
  sdkNext,
  knownTracks,
}: {
  current: SpotifyNowPlaying;
  sdkNext: readonly SdkQueueTrack[];
  knownTracks?: ReadonlyMap<string, SpotifyNowPlaying>;
}) {
  const upcoming: SpotifyNowPlaying[] = [];
  for (const track of sdkNext) {
    if (!track.id) continue;
    const prior = knownTracks?.get(track.id);
    upcoming.push({
      id: track.id,
      uri: track.uri ?? prior?.uri,
      name: track.name || prior?.name || "",
      artists:
        (track.artists ?? [])
          .map((artist) => artist.name)
          .filter(Boolean)
          .join(", ") ||
        prior?.artists ||
        track.show?.name ||
        "",
      albumName:
        track.album?.name ??
        track.show?.name ??
        prior?.albumName ??
        "",
      imageUrl:
        track.album?.images?.[0]?.url ??
        track.show?.images?.[0]?.url ??
        prior?.imageUrl ??
        null,
      durationMs: prior?.durationMs ?? 0,
      spotifyUrl: spotifyUrl(track),
    });
  }
  return [current, ...upcoming];
}
