import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET, PUT } from "@/app/api/spotify/stats/route";
import {
  emptyListeningStats,
  type ListeningStats,
  type ListeningTrackStat,
} from "@/lib/spotify/stats";

let directory: string;
let cookie: string;

function profileCookie() {
  return Buffer.from(
    JSON.stringify({
      id: "user-1",
      displayName: "Premium Listener",
      imageUrl: null,
      product: "premium",
      premium: true,
    }),
    "utf8",
  ).toString("base64url");
}

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

function request(
  method: "GET" | "PUT",
  options: { cookie?: string; body?: unknown } = {},
) {
  return new NextRequest("http://localhost/api/spotify/stats", {
    method,
    headers: {
      ...(options.cookie ? { cookie: options.cookie } : {}),
      ...(options.body ? { "content-type": "application/json" } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
}

beforeEach(async () => {
  directory = await mkdtemp(path.join(tmpdir(), "hermes-stats-route-"));
  process.env.HERMES_STATS_STORE = path.join(directory, "stats.json");
  vi.stubEnv("SPOTIFY_CLIENT_ID", "a".repeat(32));
  vi.stubEnv("SPOTIFY_CLIENT_SECRET", "b".repeat(32));
  cookie = [
    "hermes_spotify_access=fake-access-token",
    "hermes_spotify_refresh=secret-refresh-token",
    `hermes_spotify_expires=${Date.now() + 60 * 60 * 1_000}`,
    `hermes_spotify_profile=${profileCookie()}`,
  ].join("; ");
});

afterEach(async () => {
  vi.unstubAllEnvs();
  delete process.env.HERMES_STATS_STORE;
  await rm(directory, { recursive: true, force: true });
});

describe("account stats route", () => {
  it("reports not connected without a session", async () => {
    const response = await PUT(
      request("PUT", {
        body: {
          browserId: "browser-chrome",
          stats: ledger([stat("a", 1, 1_000)]),
        },
      }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      connected: false,
      stats: emptyListeningStats(),
    });
  });

  it("merges two browsers for the connected account", async () => {
    const first = await PUT(
      request("PUT", {
        cookie,
        body: {
          browserId: "browser-chrome",
          stats: ledger([stat("a", 1, 1_000)]),
        },
      }),
    );
    expect(first.status).toBe(200);
    expect((await first.json()).connected).toBe(true);

    const second = await PUT(
      request("PUT", {
        cookie,
        body: {
          browserId: "browser-brave",
          stats: ledger([stat("a", 2, 2_000), stat("b", 1, 500)]),
        },
      }),
    );
    const secondBody = await second.json();
    expect(secondBody.stats.tracks.a.plays).toBe(3);
    expect(secondBody.stats.tracks.a.listenedMs).toBe(3_000);
    expect(secondBody.stats.tracks.b.plays).toBe(1);
    expect(JSON.stringify(secondBody)).not.toContain("fake-access-token");
    expect(JSON.stringify(secondBody)).not.toContain("secret-refresh-token");

    const read = await GET(request("GET", { cookie }));
    const readBody = await read.json();
    expect(readBody.connected).toBe(true);
    expect(readBody.stats.tracks.a.plays).toBe(3);
    expect(readBody.stats.tracks.b.plays).toBe(1);
  });

  it("rejects an invalid browser id", async () => {
    const response = await PUT(
      request("PUT", {
        cookie,
        body: {
          browserId: "../bad",
          stats: ledger([stat("a", 1, 1_000)]),
        },
      }),
    );
    expect(response.status).toBe(400);
    expect((await response.json()).connected).toBe(false);
  });
});
