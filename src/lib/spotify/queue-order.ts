import type { SpotifyNowPlaying } from "./playback-types";

/**
 * Spotify keeps a manual queue ("Next in queue") in front of the context's
 * upcoming list ("Next from: ..."). The SDK's next_tracks contains both. To
 * display our own manual list without duplicating the SDK copy, remove the
 * first occurrence of each manual entry from the SDK upcoming list; later
 * copies that belong to the context stay.
 */
export function removeManualOccurrences(
  upcoming: readonly SpotifyNowPlaying[],
  manual: readonly SpotifyNowPlaying[],
): SpotifyNowPlaying[] {
  if (manual.length === 0) return [...upcoming];

  const remaining = new Map<string, number>();
  for (const item of manual) {
    remaining.set(item.id, (remaining.get(item.id) ?? 0) + 1);
  }

  return upcoming.filter((item) => {
    const count = remaining.get(item.id) ?? 0;
    if (count <= 0) return true;
    remaining.set(item.id, count - 1);
    return false;
  });
}

/** The flat display queue: current, then manual queue, then context. */
export function buildDisplayQueue({
  current,
  manual,
  contextUpcoming,
}: {
  current: SpotifyNowPlaying | null;
  manual: readonly SpotifyNowPlaying[];
  contextUpcoming: readonly SpotifyNowPlaying[];
}): SpotifyNowPlaying[] {
  if (!current) return [];
  return [current, ...manual, ...contextUpcoming];
}

/** Remove one queued occurrence of a track (the one that just started). */
export function removeManualItem(
  manual: readonly SpotifyNowPlaying[],
  trackId: string,
): SpotifyNowPlaying[] {
  const index = manual.findIndex((item) => item.id === trackId);
  if (index < 0) return [...manual];
  return [...manual.slice(0, index), ...manual.slice(index + 1)];
}

/** Split the flat upcoming list into the two Spotify sections. */
export function splitUpcoming(
  queue: readonly SpotifyNowPlaying[],
  queueIndex: number,
  manualCount: number,
): {
  upcoming: SpotifyNowPlaying[];
  manual: SpotifyNowPlaying[];
  context: SpotifyNowPlaying[];
} {
  const upcoming = queue.slice(queueIndex + 1);
  const count = Math.min(Math.max(0, manualCount), upcoming.length);
  return {
    upcoming,
    manual: upcoming.slice(0, count),
    context: upcoming.slice(count),
  };
}

/**
 * The SDK exposes only a short next_tracks window, while an explicitly started
 * collection has a known full order. Keep the known tail when the SDK window
 * is a prefix of it, so the queue does not collapse to one row between states.
 * When shuffle is on (or the SDK order diverged), the SDK order is authoritative.
 */
export function mergeContextTail({
  previousContext,
  sdkContext,
  current,
  shuffled = false,
}: {
  previousContext: readonly SpotifyNowPlaying[];
  sdkContext: readonly SpotifyNowPlaying[];
  current: SpotifyNowPlaying | null;
  shuffled?: boolean;
}): SpotifyNowPlaying[] {
  if (sdkContext.length === 0) return [];
  if (shuffled || previousContext.length === 0) return [...sdkContext];

  const currentIndex = current
    ? previousContext.findIndex((item) => item.id === current.id)
    : -1;
  const tail =
    currentIndex >= 0 ? previousContext.slice(currentIndex + 1) : previousContext;
  if (tail.length === 0) return [...sdkContext];

  const isPrefix = sdkContext.every(
    (item, index) => tail[index]?.id === item.id,
  );
  if (!isPrefix) return [...sdkContext];

  return [...sdkContext, ...tail.slice(sdkContext.length)];
}

// Queue resolution is forward-first so duplicate songs advance with playback
// instead of repeatedly resolving to the first copy.
export function resolveQueueIndex(
  queue: SpotifyNowPlaying[],
  trackId: string,
  currentIndex: number,
): number {
  if (queue.length === 0) return -1;
  const start = Math.min(Math.max(0, currentIndex), queue.length - 1);

  for (let index = start; index < queue.length; index += 1) {
    if (queue[index]?.id === trackId) return index;
  }
  for (let index = start - 1; index >= 0; index -= 1) {
    if (queue[index]?.id === trackId) return index;
  }
  return -1;
}
