import { describe, expect, it } from "vitest";
import {
  buildHistoryFallbackUris,
  mergeForwardHistory,
  planNextNavigation,
  planPreviousNavigation,
  PREVIOUS_RESTART_THRESHOLD_MS,
} from "@/lib/spotify/playback-navigation";
import {
  emptyPlaybackHistory,
  recordConfirmedPlayback,
  setHistoryCursor,
  type PlaybackHistoryState,
} from "@/lib/spotify/playback-history";
import type { SpotifyNowPlaying } from "@/lib/spotify/playback-types";

function track(id: string): SpotifyNowPlaying {
  return {
    id,
    uri: `spotify:track:${id}`,
    name: `Song ${id}`,
    artists: "Artist",
    albumName: "Album",
    imageUrl: null,
    durationMs: 180000,
    spotifyUrl: `https://open.spotify.com/track/${id}`,
  };
}

function history(...ids: string[]): PlaybackHistoryState {
  let state = emptyPlaybackHistory();
  for (const id of ids) {
    state = recordConfirmedPlayback(state, track(id)).state;
  }
  return state;
}

describe("Previous navigation", () => {
  it("returns to the actually played previous track", () => {
    const state = history("a", "b", "c");
    const plan = planPreviousNavigation({
      history: state,
      positionMs: 0,
      devicePreviousKeys: ["spotify:track:a", "spotify:track:b"],
    });
    expect(plan).toMatchObject({
      kind: "history",
      direction: "back",
      targetIndex: 1,
      nativeEligible: true,
    });
    if (plan.kind === "history") expect(plan.entry.track.id).toBe("b");
  });

  it("walks further back on repeated presses", () => {
    const state = setHistoryCursor(history("a", "b", "c"), 1);
    const plan = planPreviousNavigation({
      history: state,
      positionMs: 0,
      devicePreviousKeys: ["spotify:track:a"],
    });
    if (plan.kind !== "history") throw new Error("expected history plan");
    expect(plan.entry.track.id).toBe("a");
    expect(plan.targetIndex).toBe(0);
  });

  it("restarts the current track past the beginning threshold", () => {
    expect(
      planPreviousNavigation({
        history: history("a", "b"),
        positionMs: PREVIOUS_RESTART_THRESHOLD_MS,
      }),
    ).toEqual({ kind: "restart" });
    expect(
      planPreviousNavigation({
        history: history("a", "b"),
        positionMs: PREVIOUS_RESTART_THRESHOLD_MS - 1,
      }).kind,
    ).toBe("history");
  });

  it("does not trust a device previous list that points elsewhere", () => {
    const plan = planPreviousNavigation({
      history: history("a", "b", "c"),
      positionMs: 0,
      devicePreviousKeys: ["spotify:track:x", "spotify:track:y"],
    });
    expect(plan.kind).toBe("history");
    if (plan.kind === "history") {
      expect(plan.targetIndex).toBe(1);
      expect(plan.nativeEligible).toBe(false);
    }
  });

  it("returns nothing when confirmed history has no previous track", () => {
    expect(
      planPreviousNavigation({
        history: history("a"),
        positionMs: 0,
        devicePreviousKeys: ["spotify:track:z"],
      }),
    ).toEqual({ kind: "none", reason: "no-previous" });
  });

  it("never depends on shuffle: only the confirmed history is used", () => {
    const plan = planPreviousNavigation({
      history: history("a", "b", "c", "d"),
      positionMs: 0,
      devicePreviousKeys: ["spotify:track:c"],
    });
    if (plan.kind !== "history") throw new Error("expected history plan");
    expect(plan.entry.track.id).toBe("c");
  });
});

describe("Next navigation", () => {
  it("revisits forward history after Previous", () => {
    const state = setHistoryCursor(history("a", "b", "c", "d"), 2);
    const plan = planNextNavigation({
      history: state,
      upcoming: [track("d")],
      deviceNextKeys: ["spotify:track:d"],
    });
    expect(plan).toMatchObject({
      kind: "history",
      direction: "forward",
      targetIndex: 3,
      nativeEligible: true,
    });
    if (plan.kind === "history") expect(plan.entry.track.id).toBe("d");
  });

  it("plays the manual queue before forward history", () => {
    const state = setHistoryCursor(history("a", "b", "c"), 0);
    const manual = track("m1");
    const plan = planNextNavigation({
      history: state,
      upcoming: [manual, track("b"), track("c")],
      deviceNextKeys: [
        "spotify:track:m1",
        "spotify:track:b",
        "spotify:track:c",
      ],
      manualCount: 1,
    });
    expect(plan).toMatchObject({
      kind: "queue",
      targetKey: "spotify:track:m1",
      nativeEligible: true,
    });
  });

  it("falls back to the queue when forward history is exhausted", () => {
    const plan = planNextNavigation({
      history: history("a", "b"),
      upcoming: [track("q1"), track("q2")],
      deviceNextKeys: ["spotify:track:q1", "spotify:track:q2"],
    });
    expect(plan).toEqual({
      kind: "queue",
      target: track("q1"),
      targetKey: "spotify:track:q1",
      uris: ["spotify:track:q1", "spotify:track:q2"],
      nativeEligible: true,
    });
  });

  it("keeps the stable shuffled upcoming order across presses", () => {
    const upcoming = [track("s3"), track("s1"), track("s4"), track("s2")];
    const first = planNextNavigation({
      history: history("a"),
      upcoming,
      deviceNextKeys: ["spotify:track:s3"],
    });
    const second = planNextNavigation({
      history: history("a"),
      upcoming,
      deviceNextKeys: ["spotify:track:s3"],
    });
    expect(first).toEqual(second);
    if (first.kind === "queue") {
      expect(first.uris).toEqual(upcoming.map((item) => item.uri));
    }
  });

  it("does nothing when history, queue and device have no next track", () => {
    expect(
      planNextNavigation({ history: history("a"), upcoming: [] }),
    ).toEqual({ kind: "none", reason: "no-next" });
    expect(
      planNextNavigation({
        history: history("a"),
        upcoming: [],
        deviceNextKeys: [],
      }),
    ).toEqual({ kind: "none", reason: "no-next" });
  });

  it("defers to the device only when it reports a next track", () => {
    expect(
      planNextNavigation({
        history: history("a"),
        upcoming: [],
        deviceNextKeys: ["spotify:track:b"],
      }),
    ).toEqual({ kind: "native" });
  });

  it("does not trust a device queue that points at another track", () => {
    const plan = planNextNavigation({
      history: history("a"),
      upcoming: [track("b")],
      deviceNextKeys: ["spotify:track:z"],
    });
    if (plan.kind !== "queue") throw new Error("expected queue plan");
    expect(plan.targetKey).toBe("spotify:track:b");
    expect(plan.nativeEligible).toBe(false);
  });
});

describe("Queue/history merge", () => {
  it("puts forward history before the remaining device queue", () => {
    const state = setHistoryCursor(history("a", "b", "c", "d"), 1);
    const merged = mergeForwardHistory({
      history: state,
      upcoming: [track("c"), track("x")],
    });
    expect(merged.map((item) => item.id)).toEqual(["c", "d", "x"]);
  });

  it("keeps intentional duplicate queue entries", () => {
    const merged = mergeForwardHistory({
      history: history("a"),
      upcoming: [track("b"), track("b")],
    });
    expect(merged.map((item) => item.id)).toEqual(["b", "b"]);
  });

  it("builds a fallback that starts on the target and consumes its queued copy", () => {
    const state = history("a", "b", "c", "d");
    const uris = buildHistoryFallbackUris({
      history: state,
      targetIndex: 2,
      upcoming: [track("x"), track("c"), track("d")],
    });
    expect(uris).toEqual([
      "spotify:track:c",
      "spotify:track:d",
      "spotify:track:x",
    ]);
  });

  it("keeps a second copy of the target as an intentional repeat", () => {
    const uris = buildHistoryFallbackUris({
      history: history("a", "b"),
      targetIndex: 1,
      upcoming: [track("b"), track("b")],
    });
    expect(uris).toEqual(["spotify:track:b", "spotify:track:b"]);
  });

  it("returns nothing when the target index is no longer in history", () => {
    expect(
      buildHistoryFallbackUris({
        history: history("a"),
        targetIndex: 3,
        upcoming: [track("b")],
      }),
    ).toEqual([]);
  });
});
