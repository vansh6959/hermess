import type { SpotifyNowPlaying } from "./playback-types";

export interface PlaybackHistoryEntry {
  key: string;
  track: SpotifyNowPlaying;
}

export interface PlaybackHistoryState {
  entries: PlaybackHistoryEntry[];
  cursor: number;
}

export function playbackTrackKey(
  track: Pick<SpotifyNowPlaying, "id" | "uri">,
): string {
  return track.uri && track.uri.length > 0
    ? track.uri
    : `spotify:track:${track.id}`;
}

function normalizeTrackText(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Spotify publishes the same recording under multiple track/album IDs. The
 * populated library can hold one release while the player reports another, so
 * identity checks cannot rely on the ID alone.
 */
export function isSamePlaybackTrack(
  first: SpotifyNowPlaying,
  second: SpotifyNowPlaying,
): boolean {
  if (first.id === second.id) return true;
  if (playbackTrackKey(first) === playbackTrackKey(second)) return true;
  const name = normalizeTrackText(first.name);
  if (!name || name !== normalizeTrackText(second.name)) return false;
  const artists = normalizeTrackText(first.artists);
  if (!artists || artists !== normalizeTrackText(second.artists)) return false;
  return Math.abs(first.durationMs - second.durationMs) <= 1_500;
}

function entryFor(track: SpotifyNowPlaying): PlaybackHistoryEntry {
  return { key: playbackTrackKey(track), track };
}

export function emptyPlaybackHistory(): PlaybackHistoryState {
  return { entries: [], cursor: -1 };
}

export function currentHistoryEntry(
  state: PlaybackHistoryState,
): PlaybackHistoryEntry | null {
  return state.entries[state.cursor] ?? null;
}

export function previousHistoryEntry(
  state: PlaybackHistoryState,
): PlaybackHistoryEntry | null {
  return state.cursor > 0 ? state.entries[state.cursor - 1] : null;
}

export function forwardHistoryEntry(
  state: PlaybackHistoryState,
): PlaybackHistoryEntry | null {
  return state.cursor >= 0 && state.cursor < state.entries.length - 1
    ? state.entries[state.cursor + 1]
    : null;
}

export type PlaybackRecordOrigin = "auto" | "manual";

/**
 * Records only confirmed playback transitions. A duplicate event for the
 * current track is ignored; a confirmed track matching forward history moves
 * the cursor instead of appending; automatic playback that returns to the
 * immediately previous entry is a confirmed step back; any other new track
 * truncates forward history and becomes the new tail. Manual selections never
 * step back because the user may be intentionally replaying a song.
 */
export function recordConfirmedPlayback(
  state: PlaybackHistoryState,
  track: SpotifyNowPlaying,
  origin: PlaybackRecordOrigin = "auto",
): {
  state: PlaybackHistoryState;
  changed: boolean;
  appended: boolean;
} {
  const entry = entryFor(track);
  if (state.entries.length === 0 || state.cursor < 0) {
    return {
      state: { entries: [entry], cursor: 0 },
      changed: true,
      appended: true,
    };
  }

  const current = state.entries[state.cursor];
  if (current?.key === entry.key) {
    return { state, changed: false, appended: false };
  }

  const forward = state.entries[state.cursor + 1];
  if (forward?.key === entry.key) {
    return {
      state: { ...state, cursor: state.cursor + 1 },
      changed: true,
      appended: false,
    };
  }

  if (origin === "auto" && state.cursor > 0) {
    const previous = state.entries[state.cursor - 1];
    if (previous?.key === entry.key) {
      return {
        state: { ...state, cursor: state.cursor - 1 },
        changed: true,
        appended: false,
      };
    }
  }

  const entries = [...state.entries.slice(0, state.cursor + 1), entry];
  return {
    state: { entries, cursor: entries.length - 1 },
    changed: true,
    appended: true,
  };
}

/** Discards only the unreachable future; confirmed history is preserved. */
export function truncateForwardHistory(
  state: PlaybackHistoryState,
): PlaybackHistoryState {
  if (state.cursor < 0 || state.cursor >= state.entries.length - 1) {
    return state;
  }
  return {
    entries: state.entries.slice(0, state.cursor + 1),
    cursor: state.cursor,
  };
}

export function setHistoryCursor(
  state: PlaybackHistoryState,
  cursor: number,
): PlaybackHistoryState {
  if (cursor < 0 || cursor >= state.entries.length) return state;
  return { ...state, cursor };
}

export function historyEntryAt(
  state: PlaybackHistoryState,
  index: number,
): PlaybackHistoryEntry | null {
  return state.entries[index] ?? null;
}
