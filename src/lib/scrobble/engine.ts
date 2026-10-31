export const SCROBBLE_MIN_TRACK_SECONDS = 30;
export const SCROBBLE_MAX_THRESHOLD_SECONDS = 240;
// Without a trustworthy duration, waiting the maximum possible threshold
// guarantees the official half-duration rule is satisfied for every eligible
// track. The duration stays absent from the record instead of being guessed.
export const SCROBBLE_UNKNOWN_DURATION_THRESHOLD_SECONDS = 240;

export interface ScrobblePayload {
  artist: string;
  track: string;
  album?: string;
  duration?: number;
  timestamp: number;
}

export interface ScrobbleTrack {
  id: string;
  name: string;
  artists: string;
  albumName: string;
  durationMs: number;
}

export interface ScrobbleSession {
  trackId: string;
  startedAt: number;
  listenedMs: number;
  thresholdMs: number | null;
  durationSeconds: number | null;
  scrobbled: boolean;
}

export function scrobbleThresholdSeconds(
  durationSeconds: number | null | undefined,
): number | null {
  if (
    durationSeconds === null ||
    durationSeconds === undefined ||
    !Number.isFinite(durationSeconds) ||
    durationSeconds <= 0
  ) {
    return SCROBBLE_UNKNOWN_DURATION_THRESHOLD_SECONDS;
  }
  // Official rule: "A track must be longer than 30 seconds." Exactly
  // 30 seconds is therefore not eligible.
  if (durationSeconds <= SCROBBLE_MIN_TRACK_SECONDS) return null;
  return Math.min(durationSeconds / 2, SCROBBLE_MAX_THRESHOLD_SECONDS);
}

export function createScrobbleSession(
  track: ScrobbleTrack,
  startedAtMs = Date.now(),
): ScrobbleSession {
  const durationSeconds =
    Number.isFinite(track.durationMs) && track.durationMs > 0
      ? track.durationMs / 1000
      : null;
  const threshold = scrobbleThresholdSeconds(durationSeconds);
  return {
    trackId: track.id,
    startedAt: Math.max(0, Math.floor(startedAtMs / 1000)),
    listenedMs: 0,
    thresholdMs: threshold === null ? null : threshold * 1000,
    durationSeconds,
    scrobbled: false,
  };
}

export function advanceScrobbleSession(
  session: ScrobbleSession,
  deltaMs: number,
  track: ScrobbleTrack,
): { session: ScrobbleSession; due: ScrobblePayload | null } {
  if (session.scrobbled || session.thresholdMs === null) {
    return { session, due: null };
  }
  if (!Number.isFinite(deltaMs) || deltaMs <= 0) {
    return { session, due: null };
  }

  const listenedMs = session.listenedMs + deltaMs;
  const updated = { ...session, listenedMs };
  if (listenedMs < session.thresholdMs) {
    return { session: updated, due: null };
  }

  return {
    session: { ...updated, scrobbled: true },
    due: {
      artist: track.artists,
      track: track.name,
      ...(track.albumName ? { album: track.albumName } : {}),
      ...(session.durationSeconds !== null
        ? { duration: Math.round(session.durationSeconds) }
        : {}),
      // The timestamp is when the track started playing, not when the
      // eligibility threshold was crossed.
      timestamp: session.startedAt,
    },
  };
}
