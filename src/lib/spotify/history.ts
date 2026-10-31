import type { SpotifyNowPlaying } from "./playback-types";

export interface SpotifyHistoryTrack {
  id: string;
  name: string;
  artists: string;
  albumName: string;
  imageUrl: string | null;
  spotifyUrl: string;
  playedAt: number;
}

const STORAGE_KEY = "hermes.spotify.history.v1";
export const SPOTIFY_ARTISTS_STORAGE_KEY = "hermes.spotify.artists.v1";
const HISTORY_EVENT = "hermes:spotify-history";
const LIMIT = 40;

function canUseStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function isHistoryTrack(value: unknown): value is SpotifyHistoryTrack {
  if (!value || typeof value !== "object") return false;
  const track = value as Partial<SpotifyHistoryTrack>;
  return (
    typeof track.id === "string" &&
    typeof track.name === "string" &&
    typeof track.artists === "string" &&
    typeof track.playedAt === "number"
  );
}

export function readSpotifyHistory(): SpotifyHistoryTrack[] {
  if (!canUseStorage()) return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    return Array.isArray(parsed)
      ? parsed.filter(isHistoryTrack).slice(0, LIMIT)
      : [];
  } catch {
    return [];
  }
}

export function recordSpotifyHistory(
  track: SpotifyNowPlaying,
  playedAt = Date.now(),
) {
  if (!canUseStorage() || !track.id) return;
  const existing = readSpotifyHistory();
  if (existing[0]?.id === track.id) return;

  const entry: SpotifyHistoryTrack = {
    id: track.id,
    name: track.name,
    artists: track.artists,
    albumName: track.albumName,
    imageUrl: track.imageUrl,
    spotifyUrl: track.spotifyUrl,
    playedAt,
  };
  const next = [entry, ...existing.filter((item) => item.id !== track.id)].slice(
    0,
    LIMIT,
  );

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    window.dispatchEvent(new Event(HISTORY_EVENT));
  } catch {
    // Storage is optional; the in-memory session still works.
  }
}

export function subscribeSpotifyHistory(onChange: () => void) {
  if (!canUseStorage()) return () => undefined;
  const handler = () => onChange();
  window.addEventListener(HISTORY_EVENT, handler);
  window.addEventListener("storage", handler);
  return () => {
    window.removeEventListener(HISTORY_EVENT, handler);
    window.removeEventListener("storage", handler);
  };
}

export function clearSpotifyHistory() {
  if (!canUseStorage()) return;
  try {
    localStorage.removeItem(STORAGE_KEY);
    window.dispatchEvent(new Event(HISTORY_EVENT));
  } catch {
    // Storage is optional.
  }
}

export function clearSpotifyArtists() {
  if (!canUseStorage()) return;
  try {
    localStorage.removeItem(SPOTIFY_ARTISTS_STORAGE_KEY);
  } catch {
    // Storage is optional.
  }
}
