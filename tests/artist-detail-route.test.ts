import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getRequestSpotifyApi: vi.fn(),
  getSpotifyApi: vi.fn(),
}));

vi.mock("@/lib/spotify/user-api", () => ({
  getRequestSpotifyApi: mocks.getRequestSpotifyApi,
  attachRefreshedTokens: (response: unknown) => response,
}));

vi.mock("@/lib/spotify/server", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/spotify/server")>();
  return { ...original, getSpotifyApi: mocks.getSpotifyApi };
});

import { GET } from "@/app/api/spotify/artist-detail/route";
import { SpotifyApiError } from "@/lib/spotify/server";

function request() {
  return new NextRequest(
    "http://localhost/api/spotify/artist-detail?name=Fallback%20Artist",
  );
}

function detail(id: string) {
  return {
    artist: {
      id,
      name: "Fallback Artist",
      imageUrl: null,
      followers: 10,
      genres: ["pop"],
      popularity: 50,
      spotifyUrl: `https://open.spotify.com/artist/${id}`,
    },
    albums: [],
    singles: [],
    topTracks: [],
  };
}

function api(overrides: Record<string, unknown> = {}) {
  return {
    search: vi.fn(async () => ({
      artists: [{ id: "artist-1", name: "Fallback Artist" }],
    })),
    artistById: vi.fn(async () => detail("artist-1").artist),
    artistReleases: vi.fn(async () => []),
    artistTopTracks: vi.fn(async () => []),
    ...overrides,
  };
}

beforeEach(() => {
  mocks.getRequestSpotifyApi.mockReset();
  mocks.getSpotifyApi.mockReset();
  mocks.getRequestSpotifyApi.mockResolvedValue({
    api: api(),
    access: { token: "user-token", refreshed: null },
  });
});

describe("artist detail route", () => {
  it("retries with client credentials when the user token is rate-limited", async () => {
    const failing = api({
      artistById: vi.fn(async () => {
        throw new SpotifyApiError("rate_limited", "Slow down.", { status: 429 });
      }),
    });
    const fallback = api();
    mocks.getRequestSpotifyApi.mockResolvedValue({
      api: failing,
      access: { token: "user-token", refreshed: null },
    });
    mocks.getSpotifyApi.mockReturnValue(fallback);

    const response = await GET(request());
    expect(response.status).toBe(200);
    expect((await response.json()).artist.id).toBe("artist-1");
    expect(fallback.artistById).toHaveBeenCalled();
  });

  it("does not retry a genuinely missing artist", async () => {
    const missing = api({
      search: vi.fn(async () => ({ artists: [] })),
    });
    mocks.getRequestSpotifyApi.mockResolvedValue({
      api: missing,
      access: { token: "user-token", refreshed: null },
    });

    const response = await GET(request());
    expect(response.status).toBe(404);
    expect(mocks.getSpotifyApi).not.toHaveBeenCalled();
  });
});
