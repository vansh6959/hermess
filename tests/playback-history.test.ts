import { describe, expect, it } from "vitest";
import {
  emptyPlaybackHistory,
  forwardHistoryEntry,
  historyEntryAt,
  isSamePlaybackTrack,
  playbackTrackKey,
  previousHistoryEntry,
  recordConfirmedPlayback,
  setHistoryCursor,
  truncateForwardHistory,
  type PlaybackHistoryState,
  type PlaybackRecordOrigin,
} from "@/lib/spotify/playback-history";
import type { SpotifyNowPlaying } from "@/lib/spotify/playback-types";

function track(
  id: string,
  uri = `spotify:track:${id}`,
): SpotifyNowPlaying {
  return {
    id,
    uri,
    name: `Song ${id}`,
    artists: "Artist",
    albumName: "Album",
    imageUrl: null,
    durationMs: 180000,
    spotifyUrl: `https://open.spotify.com/track/${id}`,
  };
}

function record(
  state: PlaybackHistoryState,
  next: SpotifyNowPlaying,
  origin: PlaybackRecordOrigin = "auto",
): PlaybackHistoryState {
  return recordConfirmedPlayback(state, next, origin).state;
}

describe("playback history", () => {
  it("records A -> B -> C in confirmed order", () => {
    let state = emptyPlaybackHistory();
    state = record(state, track("a"));
    state = record(state, track("b"));
    state = record(state, track("c"));
    expect(state.entries.map((entry) => entry.track.id)).toEqual([
      "a",
      "b",
      "c",
    ]);
    expect(state.cursor).toBe(2);
  });

  it("treats duplicate Spotify releases of the same recording as one track", () => {
    const imported: SpotifyNowPlaying = {
      ...track("3N1McBmL4FxqiHSfKAB413"),
      name: "The Best",
      artists: "Future Royalty",
      albumName: "The Best",
      durationMs: 226478,
    };
    const catalog: SpotifyNowPlaying = {
      ...imported,
      id: "16SwmZbNK8jupwoGAX6LXK",
      uri: "spotify:track:16SwmZbNK8jupwoGAX6LXK",
    };

    expect(playbackTrackKey(imported)).not.toBe(playbackTrackKey(catalog));
    expect(isSamePlaybackTrack(imported, catalog)).toBe(true);
    expect(
      isSamePlaybackTrack(
        { ...catalog, durationMs: catalog.durationMs + 5_000 },
        imported,
      ),
    ).toBe(false);
    expect(
      isSamePlaybackTrack({ ...catalog, artists: "Someone Else" }, imported),
    ).toBe(false);
  });

  it("exposes the actual previous and forward tracks", () => {
    let state = emptyPlaybackHistory();
    for (const id of ["a", "b", "c"]) state = record(state, track(id));
    expect(previousHistoryEntry(state)?.track.id).toBe("b");
    expect(forwardHistoryEntry(state)).toBeNull();
    state = setHistoryCursor(state, 1);
    expect(previousHistoryEntry(state)?.track.id).toBe("a");
    expect(forwardHistoryEntry(state)?.track.id).toBe("c");
  });

  it("ignores duplicate confirmed events for the current track", () => {
    let state = emptyPlaybackHistory();
    state = record(state, track("a"));
    state = record(state, track("b"));
    const duplicate = recordConfirmedPlayback(state, track("b"));
    expect(duplicate.changed).toBe(false);
    expect(duplicate.appended).toBe(false);
    expect(duplicate.state.entries).toHaveLength(2);
    expect(duplicate.state.cursor).toBe(1);
  });

  it("moves forward through existing history instead of appending", () => {
    let state = emptyPlaybackHistory();
    for (const id of ["a", "b", "c"]) state = record(state, track(id));
    state = setHistoryCursor(state, 1);
    const next = recordConfirmedPlayback(state, track("c"));
    expect(next.changed).toBe(true);
    expect(next.appended).toBe(false);
    expect(next.state.cursor).toBe(2);
    expect(next.state.entries).toHaveLength(3);
  });

  it("truncates forward history after a manual selection", () => {
    let state = emptyPlaybackHistory();
    for (const id of ["a", "b", "c"]) state = record(state, track(id));
    state = setHistoryCursor(state, 1);
    state = record(state, track("d"));
    expect(state.entries.map((entry) => entry.track.id)).toEqual([
      "a",
      "b",
      "d",
    ]);
    expect(state.cursor).toBe(2);
    expect(forwardHistoryEntry(state)).toBeNull();
  });

  it("keeps manually replayed non-consecutive repeats as distinct entries", () => {
    let state = emptyPlaybackHistory();
    state = record(state, track("a"), "manual");
    state = record(state, track("b"), "manual");
    state = record(state, track("a"), "manual");
    expect(state.entries.map((entry) => entry.track.id)).toEqual([
      "a",
      "b",
      "a",
    ]);
    expect(state.cursor).toBe(2);
    state = setHistoryCursor(state, 1);
    expect(previousHistoryEntry(state)?.track.id).toBe("a");
    expect(forwardHistoryEntry(state)?.track.id).toBe("a");
  });

  it("walks the cursor back when playback confirms the previous entry", () => {
    let state = emptyPlaybackHistory();
    for (const id of ["a", "b", "c"]) state = record(state, track(id));
    const externalBack = recordConfirmedPlayback(state, track("b"));
    expect(externalBack.appended).toBe(false);
    expect(externalBack.state.cursor).toBe(1);
    expect(externalBack.state.entries).toHaveLength(3);
  });

  it("does not mistake a manual replay of the previous track for a step back", () => {
    let state = emptyPlaybackHistory();
    for (const id of ["a", "b", "c"]) state = record(state, track(id));
    state = record(state, track("b"), "manual");
    expect(state.entries.map((entry) => entry.track.id)).toEqual([
      "a",
      "b",
      "c",
      "b",
    ]);
    expect(state.cursor).toBe(3);
  });

  it("truncates only forward history before a manual context change", () => {
    let state = emptyPlaybackHistory();
    for (const id of ["a", "b", "c"]) state = record(state, track(id));
    state = setHistoryCursor(state, 1);
    const truncated = truncateForwardHistory(state);
    expect(truncated.entries.map((entry) => entry.track.id)).toEqual([
      "a",
      "b",
    ]);
    expect(truncated.cursor).toBe(1);
    expect(truncateForwardHistory(truncated)).toBe(truncated);
    expect(truncateForwardHistory(emptyPlaybackHistory())).toEqual(
      emptyPlaybackHistory(),
    );
  });

  it("uses the Spotify URI as the stable key when available", () => {
    expect(playbackTrackKey(track("a"))).toBe("spotify:track:a");
    expect(
      playbackTrackKey({ id: "a", uri: "spotify:episode:ep-1" }),
    ).toBe("spotify:episode:ep-1");
    let state = emptyPlaybackHistory();
    state = record(state, track("a"));
    state = record(state, track("b"));
    state = record(
      state,
      {
        ...track("a"),
        uri: "spotify:track:a",
      },
      "manual",
    );
    expect(state.entries).toHaveLength(3);
  });

  it("bounds cursor changes safely", () => {
    let state = emptyPlaybackHistory();
    state = record(state, track("a"));
    expect(setHistoryCursor(state, -1)).toBe(state);
    expect(setHistoryCursor(state, 3)).toBe(state);
    expect(historyEntryAt(state, 0)?.track.id).toBe("a");
    expect(historyEntryAt(state, 1)).toBeNull();
  });
});
