import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  emptyListeningStats,
  type ListeningStats,
  type ListeningTrackStat,
} from "@/lib/spotify/stats";
import {
  readAccountListeningStats,
  upsertBrowserListeningStats,
} from "@/lib/spotify/stats-store";

let directory: string;
let storeFile: string;

function stat(id: string, plays: number, listenedMs: number): ListeningTrackStat {
  return {
    id,
    name: `Track ${id}`,
    artists: "Artist",
    albumName: "Album",
    imageUrl: null,
    spotifyUrl: `https://open.spotify.com/track/${id}`,
    plays,
    listenedMs,
    lastPlayedAt: 100,
  };
}

function ledger(tracks: ListeningTrackStat[]): ListeningStats {
  return {
    ...emptyListeningStats(),
    startedAt: 100,
    updatedAt: 200,
    totalListenedMs: tracks.reduce((sum, track) => sum + track.listenedMs, 0),
    tracks: Object.fromEntries(tracks.map((track) => [track.id, track])),
  };
}

beforeEach(async () => {
  directory = await mkdtemp(path.join(tmpdir(), "hermes-stats-"));
  storeFile = path.join(directory, "stats.json");
  process.env.HERMES_STATS_STORE = storeFile;
});

afterEach(async () => {
  delete process.env.HERMES_STATS_STORE;
  await rm(directory, { recursive: true, force: true });
});

describe("account stats store", () => {
  it("merges browser ledgers for the same account", async () => {
    await upsertBrowserListeningStats(
      "user-one",
      "browser-chrome",
      ledger([stat("a", 1, 1_000)]),
    );
    const merged = await upsertBrowserListeningStats(
      "user-one",
      "browser-brave",
      ledger([stat("a", 2, 2_000), stat("b", 1, 500)]),
    );

    expect(merged.tracks.a.plays).toBe(3);
    expect(merged.tracks.a.listenedMs).toBe(3_000);
    expect(merged.tracks.b.plays).toBe(1);
    expect(merged.totalListenedMs).toBe(3_500);
  });

  it("replaces a browser slice instead of double counting", async () => {
    const snapshot = ledger([stat("a", 1, 1_000)]);
    await upsertBrowserListeningStats("user-one", "browser-chrome", snapshot);
    await upsertBrowserListeningStats("user-one", "browser-chrome", snapshot);
    const merged = await readAccountListeningStats("user-one");
    expect(merged.tracks.a.plays).toBe(1);
    expect(merged.tracks.a.listenedMs).toBe(1_000);
  });

  it("isolates accounts", async () => {
    await upsertBrowserListeningStats(
      "user-one",
      "browser-chrome",
      ledger([stat("a", 1, 1_000)]),
    );
    await upsertBrowserListeningStats(
      "user-two",
      "browser-chrome",
      ledger([stat("b", 4, 4_000)]),
    );

    expect((await readAccountListeningStats("user-one")).tracks.a.plays).toBe(1);
    expect((await readAccountListeningStats("user-two")).tracks.b.plays).toBe(4);
    expect((await readAccountListeningStats("user-two")).tracks.a).toBeUndefined();
  });

  it("serializes concurrent browser writes without losing data", async () => {
    await Promise.all([
      upsertBrowserListeningStats(
        "user-one",
        "browser-chrome",
        ledger([stat("a", 1, 1_000)]),
      ),
      upsertBrowserListeningStats(
        "user-one",
        "browser-brave",
        ledger([stat("b", 2, 2_000)]),
      ),
    ]);
    const merged = await readAccountListeningStats("user-one");
    expect(merged.tracks.a.plays).toBe(1);
    expect(merged.tracks.b.plays).toBe(2);
  });

  it("rejects unsafe ids and persists to disk", async () => {
    const rejected = await upsertBrowserListeningStats(
      "user-one",
      "../bad id",
      ledger([stat("a", 1, 1_000)]),
    );
    expect(rejected.tracks).toEqual({});
    await upsertBrowserListeningStats(
      "user-one",
      "browser-chrome",
      ledger([stat("a", 1, 1_000)]),
    );
    const stored = JSON.parse(await readFile(storeFile, "utf8")) as {
      users: Record<string, unknown>;
    };
    expect(Object.keys(stored.users)).toEqual(["user-one"]);
  });
});
