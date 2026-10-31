import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET as token } from "@/app/api/spotify/token/route";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

function stubCredentials() {
  vi.stubEnv("SPOTIFY_CLIENT_ID", "a".repeat(32));
  vi.stubEnv("SPOTIFY_CLIENT_SECRET", "b".repeat(32));
}

function request(cookie?: string) {
  return new NextRequest("http://localhost:3002/api/spotify/token", {
    headers: cookie ? { cookie } : undefined,
  });
}

describe("Spotify token route", () => {
  it("refuses to issue a token without a user session", async () => {
    stubCredentials();
    const response = await token(request());
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({
      error: { code: "reconnect_required" },
    });
  });

  it("returns a cached access token without exposing the refresh token", async () => {
    stubCredentials();
    const response = await token(
      request(
        `hermes_spotify_access=access-token; hermes_spotify_expires=${Date.now() + 60_000 * 30}; hermes_spotify_refresh=refresh-token`,
      ),
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.accessToken).toBe("access-token");
    expect(JSON.stringify(body)).not.toContain("refresh-token");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  it("refreshes an expired access token server-side", async () => {
    stubCredentials();
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          access_token: "new-access-token",
          refresh_token: "rotated-refresh-token",
          expires_in: 3600,
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await token(
      request(
        `hermes_spotify_access=old-access-token; hermes_spotify_expires=${Date.now() - 1000}; hermes_spotify_refresh=refresh-token`,
      ),
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.accessToken).toBe("new-access-token");
    expect(JSON.stringify(body)).not.toContain("rotated-refresh-token");
    expect(response.headers.get("set-cookie")).toContain(
      "hermes_spotify_refresh=rotated-refresh-token",
    );

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://accounts.spotify.com/api/token");
    expect(String(init.body)).toContain("grant_type=refresh_token");
    expect(String(init.body)).toContain("refresh_token=refresh-token");
  });
});
