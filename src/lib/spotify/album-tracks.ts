import type { SpotifyAlbumTracksData } from "./types";

const TTL_MS = 5 * 60_000;
const MAX_ENTRIES = 40;

const cache = new Map<string, { at: number; data: SpotifyAlbumTracksData }>();
const pending = new Map<string, Promise<SpotifyAlbumTracksData>>();

interface AlbumRef {
  albumId?: string;
  trackId?: string;
}

export function albumTracksKey(ref: AlbumRef): string | null {
  if (ref.albumId) return `album:${ref.albumId}`;
  if (ref.trackId) return `track:${ref.trackId}`;
  return null;
}

function albumTracksUrl(ref: AlbumRef): string | null {
  if (ref.albumId) {
    return `/api/spotify/album?album=${encodeURIComponent(ref.albumId)}`;
  }
  if (ref.trackId) {
    return `/api/spotify/album?track=${encodeURIComponent(ref.trackId)}`;
  }
  return null;
}

export function readAlbumTracks(
  key: string,
): SpotifyAlbumTracksData | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.at > TTL_MS) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

export function loadAlbumTracks(
  ref: AlbumRef,
  force = false,
): Promise<SpotifyAlbumTracksData> {
  const key = albumTracksKey(ref);
  const url = albumTracksUrl(ref);
  if (!key || !url) {
    return Promise.reject(new Error("Album unavailable"));
  }
  if (!force) {
    const cached = readAlbumTracks(key);
    if (cached) return Promise.resolve(cached);
    const active = pending.get(key);
    if (active) return active;
  }

  const promise = fetch(url, { cache: "no-store" })
    .then(async (response) => {
      if (!response.ok) throw new Error("Album unavailable");
      const payload = (await response.json()) as SpotifyAlbumTracksData;
      if (
        !payload?.album?.id ||
        !Array.isArray(payload.tracks) ||
        payload.tracks.every((track) => !track?.id)
      ) {
        throw new Error("Album unavailable");
      }
      cache.set(key, { at: Date.now(), data: payload });
      if (cache.size > MAX_ENTRIES) {
        const oldest = [...cache.entries()].sort(
          (a, b) => a[1].at - b[1].at,
        )[0];
        if (oldest) cache.delete(oldest[0]);
      }
      return payload;
    })
    .finally(() => {
      if (pending.get(key) === promise) pending.delete(key);
    });
  pending.set(key, promise);
  return promise;
}

export function prefetchAlbumTracks(ref: AlbumRef): void {
  const key = albumTracksKey(ref);
  if (!key || readAlbumTracks(key)) return;
  void loadAlbumTracks(ref).catch(() => undefined);
}
