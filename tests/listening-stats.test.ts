import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SpotifyNowPlaying } from "@/lib/spotify/playback-types";
import {
  addListeningTime,
  clearListeningStats,
  computeListeningLeaders,
  emptyListeningStats,
  flushListeningStats,
  formatListeningTime,
  listeningTotals,
  measureListeningDelta,
  recordListeningStart,
  snapshotListeningStats,
  subscribeListeningStats,
  type ListeningStats,
} from "@/lib/spotify/stats";

const memory = new Map<string, string>();

const localStorageMock = {
  getItem: (key: string) => memory.get(key) ?? null,
  setItem: (key: string, value: string) => {
    memory.set(key, value);
  },
  removeItem: (key: string) => {
    memory.delete(key);
  },
};

function track(
  id: string,
  name: string,
  artists: string,
  albumName: string,
  imageUrl: string | null = null,
): SpotifyNowPlaying {
  return {
    id,
    name,
    artists,
    albumName,
    imageUrl,
    durationMs: 200_000,
    spotifyUrl: `https://open.spotify.com/track/${id}`,
  };
}

function storedTrack(
  id: string,
  name: string,
  artists: string,
  albumName: string,
  plays: number,
  listenedMs: number,
  lastPlayedAt = 1,
): ListeningStats["tracks"][string] {
  return {
    id,
    name,
    artists,
    albumName,
    imageUrl: `https://images.test/${id}.jpg`,
    spotifyUrl: `https://open.spotify.com/track/${id}`,
    plays,
    listenedMs,
    lastPlayedAt,
  };
}

beforeEach(() => {
  memory.clear();
  vi.stubGlobal("window", {
    localStorage: localStorageMock,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });
  clearListeningStats();
});

afterEach(() => {
  clearListeningStats();
  vi.unstubAllGlobals();
});

describe("listening stats", () => {
  it("counts plays and keeps the most recent metadata", () => {
    recordListeningStart(
      track("t1", "Starboy", "The Weeknd, Daft Punk", "Starboy"),
      1_000,
    );
    recordListeningStart(
      track("t1", "Starboy", "The Weeknd, Daft Punk", "Starboy"),
      2_000,
    );

    const snapshot = snapshotListeningStats();
    expect(snapshot.tracks.t1.plays).toBe(2);
    expect(snapshot.tracks.t1.lastPlayedAt).toBe(2_000);
    expect(snapshot.startedAt).toBe(1_000);
    expect(snapshot.totalListenedMs).toBe(0);
  });

  it("accumulates actual listened time and persists it", () => {
    const song = track("t1", "Starboy", "The Weeknd", "Starboy");
    recordListeningStart(song, 1_000);
    addListeningTime(song, 5_000, 2_000);
    addListeningTime(song, 15_000, 3_000);
    flushListeningStats();

    const snapshot = snapshotListeningStats();
    expect(snapshot.tracks.t1.listenedMs).toBe(20_000);
    expect(snapshot.totalListenedMs).toBe(20_000);
    const raw = memory.get("hermes.spotify.stats.v1");
    expect(raw).toBeTruthy();
    expect(JSON.parse(raw!).tracks.t1.listenedMs).toBe(20_000);
  });

  it("ignores negative, zero and non-finite listening deltas", () => {
    const song = track("t1", "Starboy", "The Weeknd", "Starboy");
    recordListeningStart(song, 1_000);
    addListeningTime(song, 0, 1_000);
    addListeningTime(song, -5_000, 1_000);
    addListeningTime(song, Number.NaN, 1_000);
    expect(snapshotListeningStats().totalListenedMs).toBe(0);
  });

  it("computes top 5 artists, albums and tracks", () => {
    const stats = emptyListeningStats();
    const entries = [
      storedTrack("t1", "Starboy", "The Weeknd, Daft Punk", "Starboy", 8, 3_600_000, 8),
      storedTrack("t2", "HUMBLE.", "Kendrick Lamar", "DAMN.", 6, 2_400_000, 7),
      storedTrack("t3", "Blinding Lights", "The Weeknd", "After Hours", 7, 2_000_000, 6),
      storedTrack("t4", "Rap God", "Eminem", "The Marshall Mathers LP 2", 5, 1_800_000, 5),
      storedTrack("t5", "Snooze", "SZA", "SOS", 4, 1_200_000, 4),
      storedTrack("t6", "Lost", "Frank Ocean", "Blonde", 3, 900_000, 3),
    ];
    for (const entry of entries) stats.tracks[entry.id] = entry;
    stats.totalListenedMs = entries.reduce(
      (total, entry) => total + entry.listenedMs,
      0,
    );

    const leaders = computeListeningLeaders(stats);
    expect(leaders.artists).toHaveLength(5);
    expect(leaders.albums).toHaveLength(5);
    expect(leaders.tracks).toHaveLength(5);
    expect(leaders.artists[0]).toMatchObject({
      name: "The Weeknd",
      plays: 15,
      listenedMs: 5_600_000,
    });
    expect(leaders.artists.map((artist) => artist.name)).toContain(
      "Daft Punk",
    );
    expect(leaders.albums[0]).toMatchObject({
      name: "Starboy",
      artists: "The Weeknd",
      listenedMs: 3_600_000,
    });
    expect(leaders.albums.map((album) => album.name)).toEqual([
      "Starboy",
      "DAMN.",
      "After Hours",
      "The Marshall Mathers LP 2",
      "SOS",
    ]);
    expect(leaders.tracks.map((entry) => entry.name)).toEqual([
      "Starboy",
      "HUMBLE.",
      "Blinding Lights",
      "Rap God",
      "Snooze",
    ]);

    const totals = listeningTotals(stats);
    expect(totals.plays).toBe(33);
    expect(totals.tracks).toBe(6);
    expect(totals.artists).toBe(6);
  });

  it("measures only continuous position progress", () => {
    const previous = { trackId: "t1", positionMs: 1_000, at: 1_000 };
    expect(measureListeningDelta(previous, "t1", 2_000, false, 2_000)).toBe(
      1_000,
    );
    expect(measureListeningDelta(previous, "t1", 2_000, true, 2_000)).toBe(0);
    expect(measureListeningDelta(previous, "t2", 2_000, false, 2_000)).toBe(0);
    expect(
      measureListeningDelta(previous, "t1", 60_000, false, 2_000),
    ).toBe(0);
    expect(measureListeningDelta(previous, "t1", 500, false, 2_000)).toBe(0);
    expect(measureListeningDelta(previous, "t1", 2_000, false, 1_000)).toBe(0);
  });

  it("formats short, minute and hour durations", () => {
    expect(formatListeningTime(0)).toBe("0s");
    expect(formatListeningTime(42_000)).toBe("42s");
    expect(formatListeningTime(60_000)).toBe("1m");
    expect(formatListeningTime(3_600_000)).toBe("1h");
    expect(formatListeningTime(11_900_000)).toBe("3h 18m");
  });

  it("notifies subscribers and clears persisted stats", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeListeningStats(listener);
    recordListeningStart(track("t1", "Starboy", "The Weeknd", "Starboy"), 1_000);
    expect(listener).toHaveBeenCalled();
    expect(memory.has("hermes.spotify.stats.v1")).toBe(true);

    clearListeningStats();
    expect(memory.has("hermes.spotify.stats.v1")).toBe(false);
    expect(Object.keys(snapshotListeningStats().tracks)).toHaveLength(0);
    unsubscribe();
  });
});
