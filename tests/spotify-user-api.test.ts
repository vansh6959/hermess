import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const mocks = vi.hoisted(() => ({
  readUserAccess: vi.fn(),
}));

vi.mock("@/lib/spotify/user-token", () => ({
  readUserAccess: mocks.readUserAccess,
}));

import {
  attachRefreshedTokens,
  getRequestSpotifyApi,
} from "@/lib/spotify/user-api";
import { GET as searchGET } from "@/app/api/spotify/search/route";

function request() {
  return new NextRequest("http://127.0.0.1:3000/api/spotify/search?q=probe");
}

function searchBody() {
  return {
    tracks: { items: [] },
    albums: { items: [] },
    artists: { items: [] },
  };
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
  mocks.readUserAccess.mockReset();
  process.env.SPOTIFY_CLIENT_ID = "test-client-id";
  process.env.SPOTIFY_CLIENT_SECRET = "test-client-secret";
  process.env.SPOTIFY_MARKET = "US";
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.SPOTIFY_CLIENT_ID;
  delete process.env.SPOTIFY_CLIENT_SECRET;
  delete process.env.SPOTIFY_MARKET;
});

describe("request-scoped Spotify API", () => {
  it("uses the connected user token instead of a client-credentials token", async () => {
    mocks.readUserAccess.mockResolvedValue({
      token: "connected-user-token",
      refreshed: null,
    });
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify(searchBody()), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    const { api, access } = await getRequestSpotifyApi(request());
    expect(access?.token).toBe("connected-user-token");
    expect(api).not.toBeNull();

    await api!.search("request scoped user probe");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("api.spotify.com/v1/search");
    expect((init.headers as Record<string, string>).Authorization).toBe(
      "Bearer connected-user-token",
    );
  });

  it("routes search through the user token and persists refreshed credentials", async () => {
    const refreshed = {
      accessToken: "fresh-route-token",
      refreshToken: "fresh-route-refresh",
      expiresIn: 3600,
    };
    mocks.readUserAccess.mockResolvedValue({
      token: "fresh-route-token",
      refreshed,
    });
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify(searchBody()), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    const response = await searchGET(
      new NextRequest(
        "http://127.0.0.1:3000/api/spotify/search?q=route%20user%20probe",
      ),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.provider).toBe("spotify");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("api.spotify.com/v1/search");
    expect((init.headers as Record<string, string>).Authorization).toBe(
      "Bearer fresh-route-token",
    );
    expect(response.headers.get("set-cookie")).toContain(
      "hermes_spotify_access=",
    );
  });

  it("persists refreshed user cookies on an API response", () => {
    const refreshed = {
      accessToken: "refreshed-access",
      refreshToken: "refreshed-refresh",
      expiresIn: 3600,
    };
    const response = NextResponse.json({ ok: true });
    const result = attachRefreshedTokens(
      response,
      { token: "refreshed-access", refreshed },
      request(),
    );

    const cookies = result.headers.get("set-cookie") ?? "";
    expect(cookies).toContain("hermes_spotify_access=");
    expect(cookies).toContain("hermes_spotify_refresh=");
    expect(cookies).toContain("hermes_spotify_expires=");
    expect(cookies).not.toContain("client-secret");
  });

  it("falls back to the shared client API when no user session is present", async () => {
    mocks.readUserAccess.mockResolvedValue(null);
    const { api, access } = await getRequestSpotifyApi(request());
    expect(access).toBeNull();
    expect(api).not.toBeNull();
  });
});
