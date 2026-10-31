import {
  forwardHistoryEntry,
  playbackTrackKey,
  previousHistoryEntry,
  type PlaybackHistoryEntry,
  type PlaybackHistoryState,
} from "./playback-history";
import type { SpotifyNowPlaying } from "./playback-types";

export const PREVIOUS_RESTART_THRESHOLD_MS = 2_000;

export type PlaybackNavigationDirection = "back" | "forward";

export interface PreviousNavigationContext {
  history: PlaybackHistoryState;
  positionMs: number;
  devicePreviousKeys?: readonly string[];
}

export type PreviousNavigationPlan =
  | { kind: "restart" }
  | {
      kind: "history";
      direction: "back";
      entry: PlaybackHistoryEntry;
      targetIndex: number;
      nativeEligible: boolean;
    }
  | { kind: "none"; reason: "no-previous" };

export interface NextNavigationContext {
  history: PlaybackHistoryState;
  upcoming: readonly SpotifyNowPlaying[];
  deviceNextKeys?: readonly string[];
  // Manual queue entries sit at the head of `upcoming`; Spotify always plays
  // them before the context, even when forward history exists.
  manualCount?: number;
}

export type NextNavigationPlan =
  | {
      kind: "history";
      direction: "forward";
      entry: PlaybackHistoryEntry;
      targetIndex: number;
      nativeEligible: boolean;
    }
  | {
      kind: "queue";
      target: SpotifyNowPlaying;
      targetKey: string;
      uris: string[];
      nativeEligible: boolean;
    }
  | { kind: "native" }
  | { kind: "none"; reason: "no-next" };

/**
 * Precedence: restart the current track past the threshold, otherwise the
 * confirmed previous history entry. The device's own previous list only
 * decides whether native skipping can be trusted; it never picks the track.
 */
export function planPreviousNavigation(
  context: PreviousNavigationContext,
): PreviousNavigationPlan {
  if (context.positionMs >= PREVIOUS_RESTART_THRESHOLD_MS) {
    return { kind: "restart" };
  }

  const entry = previousHistoryEntry(context.history);
  if (!entry) return { kind: "none", reason: "no-previous" };

  const devicePrevious = context.devicePreviousKeys ?? [];
  return {
    kind: "history",
    direction: "back",
    entry,
    targetIndex: context.history.cursor - 1,
    nativeEligible:
      devicePrevious[devicePrevious.length - 1] === entry.key,
  };
}

/**
 * Precedence: confirmed forward history, then the authoritative upcoming
 * queue (which already carries the stable shuffle order), then the device.
 */
export function planNextNavigation(
  context: NextNavigationContext,
): NextNavigationPlan {
  const forward = forwardHistoryEntry(context.history);
  const nativeHead = context.deviceNextKeys?.[0];
  const target = context.upcoming[0];
  const targetKey = target ? playbackTrackKey(target) : null;

  if (target && targetKey && (context.manualCount ?? 0) > 0) {
    return {
      kind: "queue",
      target,
      targetKey,
      uris: context.upcoming.map(playbackTrackKey),
      nativeEligible: nativeHead === targetKey,
    };
  }

  if (forward) {
    return {
      kind: "history",
      direction: "forward",
      entry: forward,
      targetIndex: context.history.cursor + 1,
      nativeEligible: nativeHead === forward.key,
    };
  }

  if (!target || !targetKey) {
    // With no forward context the device would loop/restart the current
    // track; only use the device when it actually reports a next track.
    if (!context.deviceNextKeys?.length) {
      return { kind: "none", reason: "no-next" };
    }
    return { kind: "native" };
  }

  return {
    kind: "queue",
    target,
    targetKey,
    uris: context.upcoming.map(playbackTrackKey),
    nativeEligible: nativeHead === targetKey,
  };
}

/**
 * Forward history is the next-track authority, but the device queue may still
 * contain the same songs. Match duplicates one-for-one so a track that is
 * intentionally queued twice keeps both occurrences.
 */
export function mergeForwardHistory({
  history,
  upcoming,
}: {
  history: PlaybackHistoryState;
  upcoming: readonly SpotifyNowPlaying[];
}): SpotifyNowPlaying[] {
  const forward = history.entries
    .slice(history.cursor + 1)
    .map((entry) => entry.track);
  if (forward.length === 0) return [...upcoming];

  const remaining = new Map<string, number>();
  for (const track of forward) {
    const key = playbackTrackKey(track);
    remaining.set(key, (remaining.get(key) ?? 0) + 1);
  }

  const extras = upcoming.filter((track) => {
    const key = playbackTrackKey(track);
    const count = remaining.get(key) ?? 0;
    if (count > 0) {
      remaining.set(key, count - 1);
      return false;
    }
    return true;
  });

  return [...forward, ...extras];
}

/**
 * Rebuilds the device queue around a history target: the target first, then
 * forward history, then whatever the device still had upcoming.
 */
export function buildHistoryFallbackUris({
  history,
  targetIndex,
  upcoming,
}: {
  history: PlaybackHistoryState;
  targetIndex: number;
  upcoming: readonly SpotifyNowPlaying[];
}): string[] {
  const entry = history.entries[targetIndex];
  if (!entry) return [];

  const targetKey = playbackTrackKey(entry.track);
  // Playing the target consumes one copy of it from the device queue. A
  // second copy is an intentional repeat and stays queued.
  let consumed = false;
  const remainingUpcoming = upcoming.filter((track) => {
    if (!consumed && playbackTrackKey(track) === targetKey) {
      consumed = true;
      return false;
    }
    return true;
  });

  const merged = mergeForwardHistory({
    history: { ...history, cursor: targetIndex },
    upcoming: remainingUpcoming,
  });

  return [targetKey, ...merged.map(playbackTrackKey)];
}
