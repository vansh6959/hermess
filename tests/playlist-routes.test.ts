import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getRequestSpotifyApi: vi.fn(),
  readSpotifyAuth: vi.fn(),
}));

vi.mock("@/lib/spotify/user-api", () => ({
  getRequestSpotifyApi: mocks.getRequestSpotifyApi,
  attachRefreshedTokens: (response: unknown) => response,
}));

vi.mock("@/lib/spotify/cookies", () => ({
  readSpotifyAuth: mocks.readSpotifyAuth,
}));

import { GET, POST } from "@/app/api/spotify/playlists/route";

function json(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

function getRequest() {
  return new NextRequest("http://localhost/api/spotify/playlists");
}

function postRequest(body: unknown) {
  return new NextRequest("http://localhost/api/spotify/playlists", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.unstubAllGlobals();
  mocks.getRequestSpotifyApi.mockReset();
  mocks.readSpotifyAuth.mockReset();
  mocks.getRequestSpotifyApi.mockResolvedValue({
    api: {},
    access: { token: "user-token", refreshed: null },
  });
  mocks.readSpotifyAuth.mockReturnValue({
    profile: { id: "user-1" },
  });
});

describe("playlist routes", () => {
  it("lists only owned and collaborative playlists", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        json({
          items: [
            {
              id: "owned",
              name: "Owned",
              owner: { id: "user-1", display_name: "Me" },
              collaborative: false,
              tracks: { total: 4 },
              images: [{ url: "https://i.scdn.co/owned", width: 300 }],
              external_urls: { spotify: "https://open.spotify.com/playlist/owned" },
            },
            {
              id: "other",
              name: "Someone Else",
              owner: { id: "user-2" },
              collaborative: false,
              tracks: { total: 9 },
            },
            {
              id: "collab",
              name: "Shared",
              owner: { id: "user-2", display_name: "Friend" },
              collaborative: true,
              tracks: { total: 2 },
            },
          ],
          next: null,
        }),
      ),
    );

    const response = await GET(getRequest());
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.playlists.map((playlist: { id: string }) => playlist.id)).toEqual([
      "owned",
      "collab",
    ]);
    expect(body.playlists[1].collaborative).toBe(true);
  });

  it("requires a connected user token", async () => {
    mocks.getRequestSpotifyApi.mockResolvedValue({ api: {}, access: null });
    const response = await GET(getRequest());
    expect(response.status).toBe(401);
    expect((await response.json()).needsConnect).toBe(true);
  });

  it("maps scope failures to reconnect", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        json(
          { error: { status: 403, message: "Insufficient client scope" } },
          403,
        ),
      ),
    );
    const response = await POST(
      postRequest({ action: "add", playlistId: "p1", trackId: "t1" }),
    );
    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.needsScope).toBe(true);
    expect(body.error.code).toBe("needs_scope");
  });

  it("maps rate limits with Retry-After", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => json({ error: { status: 429 } }, 429, { "retry-after": "9" })),
    );
    const response = await POST(
      postRequest({ action: "add", playlistId: "p1", trackId: "t1" }),
    );
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("9");
  });

  it("creates a playlist and adds the track", async () => {
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        calls.push(`${url} ${input instanceof Request ? "" : ""}`);
        if (url.includes("/users/user-1/playlists")) {
          return json({
            id: "new-playlist",
            name: "New",
            owner: { id: "user-1" },
            external_urls: { spotify: "https://open.spotify.com/playlist/new-playlist" },
          }, 201);
        }
        return new Response(null, { status: 201 });
      }),
    );

    const response = await POST(
      postRequest({
        action: "create",
        name: "New",
        isPublic: false,
        trackId: "t1",
      }),
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.added).toBe(true);
    expect(body.playlist.id).toBe("new-playlist");
    expect(calls.some((url) => url.includes("/playlists/new-playlist/items"))).toBe(
      true,
    );
  });
});
