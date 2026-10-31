import { describe, expect, it } from "vitest";
import {
  buildDisplayQueue,
  mergeContextTail,
  removeManualItem,
  removeManualOccurrences,
  resolveQueueIndex,
  splitUpcoming,
} from "@/lib/spotify/queue-order";
import type { SpotifyNowPlaying } from "@/lib/spotify/playback-types";

function track(id: string, name = id): SpotifyNowPlaying {
  return {
    id,
    name,
    artists: "Artist",
    albumName: "Album",
    imageUrl: null,
    durationMs: 180000,
    spotifyUrl: `https://open.spotify.com/track/${id}`,
  };
}

describe("Spotify manual queue vs context", () => {
  it("keeps manual entries in front of the context", () => {
    const display = buildDisplayQueue({
      current: track("current"),
      manual: [track("added-1"), track("added-2")],
      contextUpcoming: [track("context-1"), track("context-2")],
    });
    expect(display.map((item) => item.id)).toEqual([
      "current",
      "added-1",
      "added-2",
      "context-1",
      "context-2",
    ]);
  });

  it("shows an optimistic add before the SDK acknowledges it", () => {
    const display = buildDisplayQueue({
      current: track("current"),
      manual: [track("added")],
      contextUpcoming: [track("context-1")],
    });
    expect(display.map((item) => item.id)).toEqual([
      "current",
      "added",
      "context-1",
    ]);
  });

  it("removes only the manual copy from the SDK upcoming list", () => {
    const upcoming = [
      track("added-1"),
      track("context-1"),
      track("added-2"),
      track("context-2"),
    ];
    expect(
      removeManualOccurrences(upcoming, [        track("added-1"),
        track("added-2"),
      ]).map((item) => item.id),
    ).toEqual(["context-1", "context-2"]);
  });

  it("keeps a later context copy of a manually queued song", () => {
    const upcoming = [track("a"), track("b"), track("a")];
    expect(
      removeManualOccurrences(upcoming, [track("a")]).map((item) => item.id),
    ).toEqual(["b", "a"]);
  });

  it("does not remove anything the SDK has not reported yet", () => {
    const upcoming = [track("context-1")];
    expect(
      removeManualOccurrences(upcoming, [track("added")]).map(
        (item) => item.id,
      ),
    ).toEqual(["context-1"]);
  });

  it("removes one occurrence when a manual track starts", () => {
    const manual = [track("a"), track("b"), track("a")];
    expect(
      removeManualItem(manual, "a").map((item) => item.id),
    ).toEqual(["b", "a"]);
    expect(
      removeManualItem([], "a"),
    ).toEqual([]);
  });

  it("splits the upcoming list into the two queue sections", () => {
    const queue = [
      track("current"),
      track("added-1"),
      track("added-2"),
      track("context-1"),
      track("context-2"),
    ];
    const split = splitUpcoming(queue, 0, 2);
    expect(split.manual.map((item) => item.id)).toEqual([
      "added-1",
      "added-2",
    ]);
    expect(split.context.map((item) => item.id)).toEqual([
      "context-1",
      "context-2",
    ]);
  });

  it("clamps a manual count larger than the upcoming list", () => {
    const split = splitUpcoming([track("current"), track("added")], 0, 5);
    expect(split.manual.map((item) => item.id)).toEqual(["added"]);
    expect(split.context).toEqual([]);
  });

  it("resolves duplicate songs forward from the current index", () => {
    const queue = [track("a"), track("b"), track("a"), track("c")];
    expect(resolveQueueIndex(queue, "a", 0)).toBe(0);
    expect(resolveQueueIndex(queue, "b", 0)).toBe(1);
    expect(resolveQueueIndex(queue, "a", 1)).toBe(2);
    expect(resolveQueueIndex(queue, "c", 2)).toBe(3);
  });

  it("resolves backwards when playback returns to an earlier track", () => {
    const queue = [track("a"), track("b"), track("c")];
    expect(resolveQueueIndex(queue, "a", 2)).toBe(0);
  });

  it("returns -1 when a track is outside the queue", () => {
    expect(resolveQueueIndex([track("a")], "outside", 0)).toBe(-1);
    expect(resolveQueueIndex([], "a", 0)).toBe(-1);
  });
});

describe("SDK window vs explicit context tail", () => {
  it("keeps the remaining explicit collection when the SDK window is short", () => {
    const merged = mergeContextTail({
      previousContext: [track("b"), track("c"), track("d")],
      sdkContext: [track("b"), track("c")],
      current: track("a"),
    });
    expect(merged.map((item) => item.id)).toEqual(["b", "c", "d"]);
  });

  it("keeps the context after a manual item plays", () => {
    const merged = mergeContextTail({
      previousContext: [track("b"), track("c")],
      sdkContext: [track("b")],
      current: track("manual"),
    });
    expect(merged.map((item) => item.id)).toEqual(["b", "c"]);
  });

  it("trims the context when the current track was its head", () => {
    const merged = mergeContextTail({
      previousContext: [track("b"), track("c"), track("d")],
      sdkContext: [track("c")],
      current: track("b"),
    });
    expect(merged.map((item) => item.id)).toEqual(["c", "d"]);
  });

  it("trusts the SDK order while shuffled", () => {
    const merged = mergeContextTail({
      previousContext: [track("b"), track("c"), track("d")],
      sdkContext: [track("d"), track("b")],
      current: track("a"),
      shuffled: true,
    });
    expect(merged.map((item) => item.id)).toEqual(["d", "b"]);
  });

  it("does not append a stale tail when the SDK order diverges", () => {
    const merged = mergeContextTail({
      previousContext: [track("b"), track("c")],
      sdkContext: [track("x")],
      current: track("a"),
    });
    expect(merged.map((item) => item.id)).toEqual(["x"]);
  });

  it("clears the tail when the SDK reports no upcoming tracks", () => {
    expect(
      mergeContextTail({
        previousContext: [track("b")],
        sdkContext: [],
        current: track("a"),
      }),
    ).toEqual([]);
  });
});
