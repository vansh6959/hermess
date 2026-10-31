import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getSpotifyApi: vi.fn(),
}));

vi.mock("@/lib/spotify/user-api", () => ({
  getRequestSpotifyApi: async () => ({
    api: mocks.getSpotifyApi(),
    access: null,
  }),
  attachRefreshedTokens: (response: unknown) => response,
}));

import { GET } from "@/app/api/spotify/discover/route";
import { DISCOVERY_ARTISTS } from "@/lib/spotify/discover";

function request() {
  return new NextRequest("http://127.0.0.1:3000/api/spotify/discover");
}

function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

function makeApi(
  options: { missing?: string[]; failing?: string[]; empty?: boolean } = {},
) {
  const missing = new Set(options.missing ?? []);
  const failing = new Set(options.failing ?? []);
  const namesById = new Map<string, string>();
  const search = vi.fn(async (query: string) => {
    const artistName = DISCOVERY_ARTISTS.find((name) => name === query) ?? query;
    if (failing.has(artistName)) {
      throw Object.assign(new Error("Rate limited"), { code: "rate_limited" });
    }
    if (missing.has(artistName) || options.empty) {
      return {
        query,
        fetchedAt: new Date().toISOString(),
        tracks: [],
        albums: [],
        artists: [],
      };
    }
    const artistId = `artist-${slug(artistName)}`;
    namesById.set(artistId, artistName);
    return {
      query,
      fetchedAt: new Date().toISOString(),
      tracks: [],
      albums: [
        {
          id: `album-${slug(artistName)}`,
          name: `${artistName} Album`,
          artists: artistName,
          imageUrl: `https://images.test/${slug(artistName)}.jpg`,
          releaseYear: "2024",
          totalTracks: 12,
          spotifyUrl: `https://open.spotify.com/album/${slug(artistName)}`,
        },
      ],
      artists: [
        {
          id: artistId,
          name: artistName,
          imageUrl: `https://images.test/${slug(artistName)}-artist.jpg`,
          genres: [],
          spotifyUrl: `https://open.spotify.com/artist/${artistId}`,
        },
      ],
    };
  });
  const artistAlbums = vi.fn(async (artistId: string) => {
    const artistName = namesById.get(artistId) ?? "Unknown";
    return [
      {
        id: `catalog-${artistId}`,
        name: `${artistName} Catalog`,
        artists: artistName,
        imageUrl: `https://images.test/${artistId}.jpg`,
        releaseYear: "2023",
        totalTracks: 10,
        spotifyUrl: `https://open.spotify.com/album/${artistId}`,
      },
    ];
  });
  return { search, artistAlbums };
}

beforeEach(() => {
  mocks.getSpotifyApi.mockReset();
  delete (globalThis as { __hermesDiscoverCacheV2?: unknown })
    .__hermesDiscoverCacheV2;
});

describe("Spotify discover route", () => {
  it("returns a verified album for every curated artist and caches it", async () => {
    const api = makeApi();
    mocks.getSpotifyApi.mockReturnValue(api);

    const first = await GET(request());
    expect(first.status).toBe(200);
    const body = await first.json();
    expect(body.complete).toBe(true);
    expect(body.covers).toHaveLength(DISCOVERY_ARTISTS.length);
    expect(body.covers.map((cover: { artist: string }) => cover.artist)).toEqual(
      [...DISCOVERY_ARTISTS],
    );
    expect(
      body.covers.every(
        (cover: { albumId?: string; imageUrl?: string }) =>
          Boolean(cover.albumId && cover.imageUrl),
      ),
    ).toBe(true);
    expect(first.headers.get("Cache-Control")).toContain("max-age=3600");

    const searchCalls = api.search.mock.calls.length;
    const albumCalls = api.artistAlbums.mock.calls.length;
    const second = await GET(request());
    const secondBody = await second.json();
    expect(secondBody.covers).toEqual(body.covers);
    expect(api.search).toHaveBeenCalledTimes(searchCalls);
    expect(api.artistAlbums).toHaveBeenCalledTimes(albumCalls);
  });

  it("keeps valid artists when one lookup fails and caches only briefly", async () => {
    const api = makeApi({ failing: ["Travis Scott"] });
    mocks.getSpotifyApi.mockReturnValue(api);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const response = await GET(request());
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.complete).toBe(false);
    expect(body.covers).toHaveLength(DISCOVERY_ARTISTS.length - 1);
    expect(
      body.covers.some(
        (cover: { title: string }) => cover.title === "Travis Scott Album",
      ),
    ).toBe(false);
    expect(
      body.covers.some(
        (cover: { title: string }) => cover.title === "The Weeknd Catalog",
      ),
    ).toBe(true);
    expect(response.headers.get("Cache-Control")).toContain("max-age=300");
    expect(warn.mock.calls.flat().join(" ")).toContain(
      "provider: rate_limited",
    );
    warn.mockRestore();
  });

  it("backs off after an empty discovery response instead of hammering Spotify", async () => {
    const api = makeApi({ empty: true });
    mocks.getSpotifyApi.mockReturnValue(api);

    const first = await GET(request());
    const firstBody = await first.json();
    expect(firstBody.covers).toEqual([]);
    expect(firstBody.complete).toBe(false);
    expect(first.headers.get("Cache-Control")).toBe("no-store");
    expect(api.search).toHaveBeenCalledTimes(DISCOVERY_ARTISTS.length);

    const second = await GET(request());
    expect(second.status).toBe(200);
    expect(api.search).toHaveBeenCalledTimes(DISCOVERY_ARTISTS.length);

    const cache = (
      globalThis as {
        __hermesDiscoverCacheV2?: { at: number };
      }
    ).__hermesDiscoverCacheV2;
    if (cache) cache.at = Date.now() - 61_000;

    await GET(request());
    expect(api.search).toHaveBeenCalledTimes(DISCOVERY_ARTISTS.length * 2);
  });

  it("reports discovery as unavailable when Spotify is not configured", async () => {
    mocks.getSpotifyApi.mockReturnValue(null);
    const response = await GET(request());
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.covers).toEqual([]);
    expect(body.complete).toBe(false);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });
});
