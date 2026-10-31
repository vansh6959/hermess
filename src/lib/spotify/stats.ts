import type { SpotifyNowPlaying } from "./playback-types";

export interface ListeningTrackStat {
  id: string;
  name: string;
  artists: string;
  albumName: string;
  imageUrl: string | null;
  spotifyUrl: string;
  plays: number;
  listenedMs: number;
  lastPlayedAt: number;
}

export interface ListeningStats {
  version: 1;
  startedAt: number | null;
  updatedAt: number;
  totalListenedMs: number;
  tracks: Record<string, ListeningTrackStat>;
}

export interface ListeningArtistLeader {
  key: string;
  name: string;
  plays: number;
  listenedMs: number;
}

export interface ListeningAlbumLeader {
  key: string;
  name: string;
  artists: string;
  imageUrl: string | null;
  plays: number;
  listenedMs: number;
}

export interface ListeningLeaders {
  artists: ListeningArtistLeader[];
  albums: ListeningAlbumLeader[];
  tracks: ListeningTrackStat[];
}

export interface ListeningTotals {
  plays: number;
  tracks: number;
  artists: number;
}

export interface ListeningClock {
  trackId: string;
  positionMs: number;
  at: number;
}

const STORAGE_KEY = "hermes.spotify.stats.v1";
const SAVE_DELAY_MS = 4_000;
const MAX_DELTA_MS = 60 * 60 * 1_000;

let state: ListeningStats | null = null;
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let dirty = false;
let pagehideBound = false;
let visibilityBound = false;
const listeners = new Set<() => void>();

function isSafeTrackId(id: string): boolean {
  return (
    Boolean(id) &&
    id !== "__proto__" &&
    id !== "prototype" &&
    id !== "constructor"
  );
}

function storage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function normalize(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function splitArtists(artists: string): string[] {
  return artists
    .split(/\s*(?:,|&|;|\bfeat\.?|\bft\.?|\bwith\b)\s*/i)
    .map((artist) => artist.trim())
    .filter(Boolean);
}

export function emptyListeningStats(): ListeningStats {
  return {
    version: 1,
    startedAt: null,
    updatedAt: 0,
    totalListenedMs: 0,
    tracks: {},
  };
}

function finiteNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : fallback;
}

function readStoredStats(): ListeningStats {
  const store = storage();
  if (!store) return emptyListeningStats();
  try {
    const raw = store.getItem(STORAGE_KEY);
    if (!raw) return emptyListeningStats();
    return normalizeListeningStats(JSON.parse(raw));
  } catch {
    return emptyListeningStats();
  }
}

const MAX_TRACKS = 5_000;
const MAX_PLAYS = 10_000_000;
const MAX_MS = 1000 * 60 * 60 * 24 * 365 * 20;

function safeText(value: unknown, maxLength = 300): string {
  if (typeof value !== "string") return "";
  return Array.from(value)
    .filter((character) => character.charCodeAt(0) >= 32)
    .join("")
    .slice(0, maxLength);
}

export function normalizeListeningStats(value: unknown): ListeningStats {
  if (!value || typeof value !== "object") return emptyListeningStats();
  const source = value as Record<string, unknown>;
  if (source.version !== 1) return emptyListeningStats();
  if (!source.tracks || typeof source.tracks !== "object") {
    return emptyListeningStats();
  }

  const tracks: Record<string, ListeningTrackStat> = {};
  let count = 0;
  for (const raw of Object.values(source.tracks as Record<string, unknown>)) {
    if (count >= MAX_TRACKS) break;
    if (!raw || typeof raw !== "object") continue;
    const entry = raw as Record<string, unknown>;
    if (typeof entry.id !== "string" || typeof entry.name !== "string") {
      continue;
    }
    const id = entry.id;
    if (!isSafeTrackId(id)) continue;
    tracks[id] = {
      id,
      name: safeText(entry.name),
      artists: safeText(entry.artists),
      albumName: safeText(entry.albumName),
      imageUrl:
        typeof entry.imageUrl === "string"
          ? safeText(entry.imageUrl, 2_048) || null
          : null,
      spotifyUrl:
        typeof entry.spotifyUrl === "string"
          ? safeText(entry.spotifyUrl, 2_048) ||
            `https://open.spotify.com/track/${id}`
          : `https://open.spotify.com/track/${id}`,
      plays: Math.min(
        MAX_PLAYS,
        Math.floor(finiteNumber(entry.plays)),
      ),
      listenedMs: Math.min(MAX_MS, finiteNumber(entry.listenedMs)),
      lastPlayedAt: finiteNumber(entry.lastPlayedAt),
    };
    count += 1;
  }

  const sum = Object.values(tracks).reduce(
    (total, track) => total + track.listenedMs,
    0,
  );
  return {
    version: 1,
    startedAt:
      typeof source.startedAt === "number" &&
      Number.isFinite(source.startedAt)
        ? source.startedAt
        : null,
    updatedAt: finiteNumber(source.updatedAt),
    totalListenedMs: sum,
    tracks,
  };
}

export function mergeListeningStats(
  ledgers: readonly ListeningStats[],
): ListeningStats {
  const merged = emptyListeningStats();
  for (const ledger of ledgers) {
    const normalized = normalizeListeningStats(ledger);
    if (
      normalized.startedAt !== null &&
      (merged.startedAt === null || normalized.startedAt < merged.startedAt)
    ) {
      merged.startedAt = normalized.startedAt;
    }
    merged.updatedAt = Math.max(merged.updatedAt, normalized.updatedAt);
    for (const track of Object.values(normalized.tracks)) {
      const existing = merged.tracks[track.id];
      if (!existing) {
        merged.tracks[track.id] = { ...track };
        continue;
      }
      const newest =
        track.lastPlayedAt >= existing.lastPlayedAt ? track : existing;
      merged.tracks[track.id] = {
        ...newest,
        plays: existing.plays + track.plays,
        listenedMs: existing.listenedMs + track.listenedMs,
        lastPlayedAt: Math.max(existing.lastPlayedAt, track.lastPlayedAt),
      };
    }
  }
  merged.totalListenedMs = Object.values(merged.tracks).reduce(
    (total, track) => total + track.listenedMs,
    0,
  );
  return merged;
}

function ensureState(): ListeningStats {
  if (!state) {
    state = readStoredStats();
    if (!pagehideBound && typeof window !== "undefined") {
      pagehideBound = true;
      window.addEventListener("pagehide", flushListeningStats);
    }
    if (!visibilityBound && typeof document !== "undefined") {
      visibilityBound = true;
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "hidden") flushListeningStats();
      });
    }
  }
  return state;
}

function cloneStats(source: ListeningStats): ListeningStats {
  return {
    ...source,
    tracks: Object.fromEntries(
      Object.entries(source.tracks).map(([id, track]) => [id, { ...track }]),
    ),
  };
}

function emit(): void {
  for (const listener of listeners) listener();
}

function writeState(): void {
  if (!state) return;
  const store = storage();
  if (!store) return;
  try {
    store.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // A full or unavailable store should not break playback.
  }
}

function persistNow(): void {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  if (!state) return;
  if (dirty) {
    writeState();
    dirty = false;
  }
  emit();
}

function scheduleSave(): void {
  if (saveTimer || typeof window === "undefined") return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    if (dirty) {
      writeState();
      dirty = false;
    }
    emit();
  }, SAVE_DELAY_MS);
}

function trackFrom(
  track: SpotifyNowPlaying,
  plays: number,
  at: number,
): ListeningTrackStat {
  return {
    id: track.id,
    name: track.name,
    artists: track.artists,
    albumName: track.albumName,
    imageUrl: track.imageUrl,
    spotifyUrl: track.spotifyUrl,
    plays,
    listenedMs: 0,
    lastPlayedAt: at,
  };
}

function updateMetadata(
  entry: ListeningTrackStat,
  track: SpotifyNowPlaying,
): void {
  entry.name = track.name;
  entry.artists = track.artists;
  entry.albumName = track.albumName;
  if (track.imageUrl) entry.imageUrl = track.imageUrl;
  entry.spotifyUrl = track.spotifyUrl;
}

export function recordListeningStart(
  track: SpotifyNowPlaying,
  at = Date.now(),
): void {
  if (!isSafeTrackId(track.id)) return;
  const snapshot = ensureState();
  const existing = snapshot.tracks[track.id];
  if (existing) {
    existing.plays += 1;
    existing.lastPlayedAt = at;
    updateMetadata(existing, track);
  } else {
    snapshot.tracks[track.id] = trackFrom(track, 1, at);
  }
  snapshot.startedAt ??= at;
  snapshot.updatedAt = at;
  dirty = true;
  persistNow();
}

export function addListeningTime(
  track: SpotifyNowPlaying,
  deltaMs: number,
  at = Date.now(),
): void {
  if (!isSafeTrackId(track.id) || !Number.isFinite(deltaMs) || deltaMs <= 0) {
    return;
  }
  const delta = Math.min(Math.round(deltaMs), MAX_DELTA_MS);
  if (delta <= 0) return;

  const snapshot = ensureState();
  const existing =
    snapshot.tracks[track.id] ?? trackFrom(track, 0, at);
  updateMetadata(existing, track);
  existing.listenedMs += delta;
  snapshot.tracks[track.id] = existing;
  snapshot.totalListenedMs += delta;
  snapshot.updatedAt = at;
  if (snapshot.startedAt === null) snapshot.startedAt = at;
  dirty = true;
  scheduleSave();
}

export function measureListeningDelta(
  previous: ListeningClock | null,
  trackId: string,
  positionMs: number,
  paused: boolean,
  at: number,
): number {
  if (!previous || previous.trackId !== trackId || paused) return 0;
  const elapsed = at - previous.at;
  const delta = positionMs - previous.positionMs;
  if (!Number.isFinite(elapsed) || elapsed <= 0) return 0;
  if (!Number.isFinite(delta) || delta <= 0) return 0;
  // Ignore forward seeks: position cannot advance further than wall time.
  if (delta > elapsed + 2_500) return 0;
  return delta;
}

export function flushListeningStats(): void {
  persistNow();
}

export function snapshotListeningStats(): ListeningStats {
  return cloneStats(ensureState());
}

export function subscribeListeningStats(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => listeners.delete(onChange);
}

export function clearListeningStats(): void {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  state = emptyListeningStats();
  dirty = false;
  const store = storage();
  if (store) {
    try {
      store.removeItem(STORAGE_KEY);
    } catch {
      // Storage is optional.
    }
  }
  emit();
}

export function formatListeningTime(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return "0s";
  const seconds = Math.round(ms / 1_000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder > 0 ? `${hours}h ${remainder}m` : `${hours}h`;
}

export function formatListeningSince(startedAt: number | null): string | null {
  if (!startedAt || !Number.isFinite(startedAt)) return null;
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(startedAt));
}

function compareLeaders(
  a: { listenedMs: number; plays: number; name: string },
  b: { listenedMs: number; plays: number; name: string },
): number {
  return (
    b.listenedMs - a.listenedMs ||
    b.plays - a.plays ||
    a.name.localeCompare(b.name)
  );
}

export function computeListeningLeaders(
  snapshot: ListeningStats,
  limit = 5,
): ListeningLeaders {
  const artists = new Map<string, ListeningArtistLeader>();
  const albums = new Map<string, ListeningAlbumLeader>();

  for (const track of Object.values(snapshot.tracks)) {
    const credited = splitArtists(track.artists);
    for (const name of credited) {
      const key = normalize(name);
      if (!key) continue;
      const existing = artists.get(key);
      if (existing) {
        existing.plays += track.plays;
        existing.listenedMs += track.listenedMs;
      } else {
        artists.set(key, {
          key,
          name,
          plays: track.plays,
          listenedMs: track.listenedMs,
        });
      }
    }

    const primary = credited[0] ?? "Unknown artist";
    const albumName = track.albumName || "Unknown album";
    const albumKey = `${normalize(albumName)}|${normalize(primary)}`;
    const album = albums.get(albumKey);
    if (album) {
      album.plays += track.plays;
      album.listenedMs += track.listenedMs;
      if (!album.imageUrl && track.imageUrl) album.imageUrl = track.imageUrl;
    } else {
      albums.set(albumKey, {
        key: albumKey,
        name: albumName,
        artists: primary,
        imageUrl: track.imageUrl,
        plays: track.plays,
        listenedMs: track.listenedMs,
      });
    }
  }

  const trackLeaders = Object.values(snapshot.tracks)
    .sort(
      (a, b) =>
        b.listenedMs - a.listenedMs ||
        b.plays - a.plays ||
        b.lastPlayedAt - a.lastPlayedAt,
    )
    .slice(0, Math.max(0, limit));

  return {
    artists: [...artists.values()]
      .sort(compareLeaders)
      .slice(0, Math.max(0, limit)),
    albums: [...albums.values()]
      .sort(compareLeaders)
      .slice(0, Math.max(0, limit)),
    tracks: trackLeaders,
  };
}

export function listeningTotals(snapshot: ListeningStats): ListeningTotals {
  const artists = new Set<string>();
  let plays = 0;
  for (const track of Object.values(snapshot.tracks)) {
    plays += track.plays;
    for (const artist of splitArtists(track.artists)) {
      const key = normalize(artist);
      if (key) artists.add(key);
    }
  }
  return {
    plays,
    tracks: Object.keys(snapshot.tracks).length,
    artists: artists.size,
  };
}
