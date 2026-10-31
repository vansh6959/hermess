import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  readSpotifyConfig: vi.fn(),
  readUserAccess: vi.fn(),
  setRefreshedTokens: vi.fn(),
}));

vi.mock("@/lib/spotify/server", () => ({
  readSpotifyConfig: mocks.readSpotifyConfig,
}));

vi.mock("@/lib/spotify/user-token", () => ({
  readUserAccess: mocks.readUserAccess,
}));

vi.mock("@/lib/spotify/cookies", () => ({
  isSecureRequest: () => false,
  setRefreshedTokens: mocks.setRefreshedTokens,
}));

import { GET } from "@/app/api/spotify/import/route";

const API = "https://api.spotify.com/v1";
const PLAYLISTS_URL = `${API}/me/playlists?limit=50`;
const LIKED_URL = `${API}/me/tracks?limit=50`;
const fetchMock = vi.fn();

function request() {
  return new NextRequest("http://127.0.0.1:3000/api/spotify/import");
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function page<T>(items: Array<T | null>, next: string | null = null) {
  return { items, next };
}

function playlistPayload(id: string, name = `Playlist ${id}`) {
  return {
    id,
    name,
    description: null,
    images: [{ url: `https://images.test/${id}.jpg`, width: 640 }],
    tracks: { total: 1 },
    external_urls: { spotify: `https://open.spotify.com/playlist/${id}` },
  };
}

function trackPayload(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    name: `Track ${id}`,
    artists: [{ name: "Test Artist" }],
    album: {
      name: "Test Album",
      images: [{ url: "https://images.test/track.jpg", width: 640 }],
    },
    duration_ms: 180000,
    external_urls: { spotify: `https://open.spotify.com/track/${id}` },
    ...overrides,
  };
}

function playlistItemsUrl(id: string, offset = 0) {
  return `${API}/playlists/${id}/items?limit=100&offset=${offset}`;
}

function routeFetch(handler: (url: string) => Response) {
  fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;
    return handler(url);
  });
}

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  mocks.readSpotifyConfig.mockReset().mockReturnValue({ configured: true });
  mocks.readUserAccess.mockReset().mockResolvedValue({
    token: "user-access-token",
    refreshed: null,
  });
  mocks.setRefreshedTokens.mockReset();
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  vi.spyOn(console, "info").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Spotify import route", () => {
  it("reports missing server configuration", async () => {
    mocks.readSpotifyConfig.mockReturnValue(null);
    const response = await GET(request());
    expect(response.status).toBe(503);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("requires a connected Spotify session", async () => {
    mocks.readUserAccess.mockResolvedValue(null);
    const response = await GET(request());
    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.needsConnect).toBe(true);
    expect(body.error.code).toBe("reconnect_required");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("retrieves every playlist, liked-song and playlist-track page", async () => {
    const playlistPage2 = `${API}/me/playlists?offset=1&limit=50`;
    const likedPage2 = `${API}/me/tracks?offset=1&limit=50`;
    const itemsPage2 = `${API}/playlists/p1/items?offset=1&limit=100`;

    routeFetch((url) => {
      if (url === PLAYLISTS_URL) {
        return jsonResponse(page([playlistPayload("p1", "Night Drive")], playlistPage2));
      }
      if (url === playlistPage2) {
        return jsonResponse(page([playlistPayload("p2", "Morning Set")]));
      }
      if (url === LIKED_URL) {
        return jsonResponse(page([{ track: trackPayload("liked-1") }], likedPage2));
      }
      if (url === likedPage2) {
        return jsonResponse(page([{ track: trackPayload("liked-2") }]));
      }
      if (url === playlistItemsUrl("p1")) {
        return jsonResponse(
          page([{ item: trackPayload("track-1") }], itemsPage2),
        );
      }
      if (url === itemsPage2) {
        return jsonResponse(page([{ item: trackPayload("track-2") }]));
      }
      if (url === playlistItemsUrl("p2")) {
        return jsonResponse(page([{ item: trackPayload("track-3") }]));
      }
      throw new Error(`Unhandled fetch: ${url}`);
    });

    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");

    const body = await response.json();
    expect(body.source).toBe("spotify");
    expect(body.playlists.map((entry: { id: string }) => entry.id)).toEqual([
      "p1",
      "p2",
    ]);
    expect(body.playlists[0].name).toBe("Night Drive");
    expect(body.playlists[0].tracks.map((track: { id: string }) => track.id)).toEqual([
      "track-1",
      "track-2",
    ]);
    expect(body.playlists[1].tracks[0].id).toBe("track-3");
    expect(body.likedSongs.map((track: { id: string }) => track.id)).toEqual([
      "liked-1",
      "liked-2",
    ]);
    expect(body.playlists[0].imageUrl).toBe("https://images.test/p1.jpg");
    expect(body.playlists[0].trackCount).toBe(2);
  });

  it("treats genuinely empty libraries as a successful result", async () => {
    routeFetch((url) => {
      if (url === PLAYLISTS_URL || url === LIKED_URL) {
        return jsonResponse(page([], null));
      }
      throw new Error(`Unhandled fetch: ${url}`);
    });

    const response = await GET(request());
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.playlists).toEqual([]);
    expect(body.likedSongs).toEqual([]);
  });

  it("reports missing playlist scopes as an explicit, recoverable error", async () => {
    routeFetch((url) => {
      if (url === PLAYLISTS_URL) {
        return jsonResponse({ error: { status: 403 } }, 403);
      }
      throw new Error(`Unhandled fetch: ${url}`);
    });

    const response = await GET(request());
    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.needsScope).toBe(true);
    expect(body.error.code).toBe("needs_scope");
    expect(body.error.message).toMatch(/Reconnect Spotify/i);
    expect(JSON.stringify(body)).not.toContain("user-access-token");
  });

  it("keeps playlists when liked songs fail partway through", async () => {
    routeFetch((url) => {
      if (url === PLAYLISTS_URL) {
        return jsonResponse(page([playlistPayload("p1")]));
      }
      if (url === LIKED_URL) {
        return jsonResponse({ error: { status: 400 } }, 400);
      }
      if (url === playlistItemsUrl("p1")) {
        return jsonResponse(page([{ item: trackPayload("track-1") }]));
      }
      throw new Error(`Unhandled fetch: ${url}`);
    });

    const response = await GET(request());
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.playlists).toHaveLength(1);
    expect(body.likedSongs).toEqual([]);
  });

  it("keeps collected tracks when a later playlist page fails", async () => {
    const itemsPage2 = `${API}/playlists/p1/items?offset=1&limit=100`;
    routeFetch((url) => {
      if (url === PLAYLISTS_URL) {
        return jsonResponse(page([playlistPayload("p1")]));
      }
      if (url === LIKED_URL) {
        return jsonResponse(page([]));
      }
      if (url === playlistItemsUrl("p1")) {
        return jsonResponse(
          page([{ item: trackPayload("track-1") }], itemsPage2),
        );
      }
      if (url === itemsPage2) {
        return jsonResponse({ error: { status: 401 } }, 401);
      }
      throw new Error(`Unhandled fetch: ${url}`);
    });

    const response = await GET(request());
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.playlists[0].tracks).toHaveLength(1);
    expect(body.playlists[0].tracks[0].id).toBe("track-1");
    expect(body.playlists[0].trackCount).toBe(1);
  });

  it("skips unavailable, local and malformed tracks without crashing", async () => {
    routeFetch((url) => {
      if (url === PLAYLISTS_URL) {
        return jsonResponse(page([playlistPayload("p1")]));
      }
      if (url === LIKED_URL) {
        return jsonResponse(
          page([
            { track: null },
            { track: trackPayload("local-1", { is_local: true }) },
            { track: trackPayload("no-id", { id: undefined }) },
            { track: trackPayload("liked-1") },
          ]),
        );
      }
      if (url === playlistItemsUrl("p1")) {
        return jsonResponse(
          page([
            null,
            { item: null },
            { item: trackPayload("arena-1") },
            { track: trackPayload("local-2", { is_local: true }) },
          ]),
        );
      }
      throw new Error(`Unhandled fetch: ${url}`);
    });

    const response = await GET(request());
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.likedSongs.map((track: { id: string }) => track.id)).toEqual([
      "liked-1",
    ]);
    expect(body.playlists[0].tracks.map((track: { id: string }) => track.id)).toEqual([
      "arena-1",
    ]);
  });

  it("falls back from playlist items to the legacy tracks endpoint", async () => {
    routeFetch((url) => {
      if (url === PLAYLISTS_URL) {
        return jsonResponse(page([playlistPayload("p1")]));
      }
      if (url === LIKED_URL) {
        return jsonResponse(page([]));
      }
      if (url === playlistItemsUrl("p1")) {
        return jsonResponse({ error: { status: 404 } }, 404);
      }
      if (url === `${API}/playlists/p1/tracks?limit=100&offset=0`) {
        return jsonResponse(page([{ track: trackPayload("legacy-1") }]));
      }
      throw new Error(`Unhandled fetch: ${url}`);
    });

    const response = await GET(request());
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.playlists[0].tracks[0].id).toBe("legacy-1");
  });

  it("stops pagination when a provider repeats the next page", async () => {
    routeFetch((url) => {
      if (url === PLAYLISTS_URL) {
        return jsonResponse(page([playlistPayload("p1")], PLAYLISTS_URL));
      }
      if (url === LIKED_URL) {
        return jsonResponse(page([], LIKED_URL));
      }
      if (url === playlistItemsUrl("p1")) {
        return jsonResponse(
          page([{ item: trackPayload("track-1") }], playlistItemsUrl("p1")),
        );
      }
      throw new Error(`Unhandled fetch: ${url}`);
    });

    const response = await GET(request());
    expect(response.status).toBe(200);
    const calls = fetchMock.mock.calls.map((call) => String(call[0]));
    expect(calls.filter((url) => url === PLAYLISTS_URL)).toHaveLength(1);
    expect(calls.filter((url) => url === LIKED_URL)).toHaveLength(1);
    expect(calls.filter((url) => url === playlistItemsUrl("p1"))).toHaveLength(1);
  });

  it("persists refreshed credentials on the import response", async () => {
    const refreshed = {
      accessToken: "refreshed-access",
      refreshToken: "refreshed-refresh",
      expiresIn: 3600,
    };
    mocks.readUserAccess.mockResolvedValue({
      token: "refreshed-access",
      refreshed,
    });
    routeFetch((url) => {
      if (url === PLAYLISTS_URL || url === LIKED_URL) {
        return jsonResponse(page([]));
      }
      throw new Error(`Unhandled fetch: ${url}`);
    });

    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(mocks.setRefreshedTokens).toHaveBeenCalledWith(
      expect.anything(),
      refreshed,
      false,
    );
  });

  it("maps provider outages without exposing credentials", async () => {
    routeFetch((url) => {
      if (url === PLAYLISTS_URL) {
        return jsonResponse({ error: { status: 400 } }, 400);
      }
      throw new Error(`Unhandled fetch: ${url}`);
    });

    const response = await GET(request());
    expect(response.status).toBe(502);
    const body = await response.json();
    expect(body.error.code).toBe("spotify_error");
    expect(JSON.stringify(body)).not.toContain("user-access-token");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });
});
