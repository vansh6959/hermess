import { describe, expect, it } from "vitest";
import {
  emptyListeningStats,
  mergeListeningStats,
  normalizeListeningStats,
  type ListeningStats,
  type ListeningTrackStat,
} from "@/lib/spotify/stats";

function stat(
  id: string,
  overrides: Partial<ListeningTrackStat> = {},
): ListeningTrackStat {
  return {
    id,
    name: `Track ${id}`,
    artists: "Artist",
    albumName: "Album",
    imageUrl: null,
    spotifyUrl: `https://open.spotify.com/track/${id}`,
    plays: 1,
    listenedMs: 60_000,
    lastPlayedAt: 100,
    ...overrides,
  };
}

function ledger(
  tracks: ListeningTrackStat[],
  overrides: Partial<ListeningStats> = {},
): ListeningStats {
  return {
    ...emptyListeningStats(),
    startedAt: 100,
    updatedAt: 200,
    totalListenedMs: tracks.reduce((sum, track) => sum + track.listenedMs, 0),
    tracks: Object.fromEntries(tracks.map((track) => [track.id, track])),
    ...overrides,
  };
}

describe("normalizeListeningStats", () => {
  it("keeps valid tracks and drops unsafe ids", () => {
    const normalized = normalizeListeningStats(
      ledger([
        stat("a"),
        stat("__proto__"),
        stat("prototype"),
      ]),
    );
    expect(Object.keys(normalized.tracks)).toEqual(["a"]);
  });

  it("returns an empty ledger for malformed values", () => {
    expect(normalizeListeningStats(null).tracks).toEqual({});
    expect(normalizeListeningStats({ version: 2, tracks: {} }).tracks).toEqual(
      {},
    );
  });
});

describe("mergeListeningStats", () => {
  it("sums plays and time per track across browsers", () => {
    const chrome = ledger([
      stat("a", { plays: 2, listenedMs: 120_000, lastPlayedAt: 500 }),
      stat("b", { plays: 1, listenedMs: 60_000 }),
    ]);
    const brave = ledger([
      stat("a", { plays: 3, listenedMs: 180_000, lastPlayedAt: 900, name: "A new" }),
      stat("c", { plays: 1, listenedMs: 30_000 }),
    ]);
    const merged = mergeListeningStats([chrome, brave]);

    expect(merged.tracks.a.plays).toBe(5);
    expect(merged.tracks.a.listenedMs).toBe(300_000);
    expect(merged.tracks.a.name).toBe("A new");
    expect(merged.tracks.a.lastPlayedAt).toBe(900);
    expect(merged.tracks.b.plays).toBe(1);
    expect(merged.tracks.c.plays).toBe(1);
    expect(merged.totalListenedMs).toBe(390_000);
    expect(merged.startedAt).toBe(100);
    expect(merged.updatedAt).toBe(200);
  });

  it("uses the earliest startedAt and latest updatedAt", () => {
    const merged = mergeListeningStats([
      ledger([stat("a")], { startedAt: 300, updatedAt: 400 }),
      ledger([stat("b")], { startedAt: 100, updatedAt: 900 }),
      ledger([], { startedAt: null, updatedAt: 50 }),
    ]);
    expect(merged.startedAt).toBe(100);
    expect(merged.updatedAt).toBe(900);
  });

  it("returns an empty ledger with no input", () => {
    expect(mergeListeningStats([]).tracks).toEqual({});
    expect(mergeListeningStats([]).totalListenedMs).toBe(0);
  });
});
