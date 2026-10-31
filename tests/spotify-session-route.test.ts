import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET as session } from "@/app/api/spotify/session/route";

afterEach(() => {
  vi.unstubAllEnvs();
});

function request(cookie?: string) {
  return new NextRequest("http://localhost:3002/api/spotify/session", {
    headers: cookie ? { cookie } : undefined,
  });
}

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

describe("Spotify session route", () => {
  it("reports not connected without cookies", async () => {
    vi.stubEnv("SPOTIFY_CLIENT_ID", "a".repeat(32));
    vi.stubEnv("SPOTIFY_CLIENT_SECRET", "b".repeat(32));
    const response = await session(request());
    expect(await response.json()).toEqual({
      configured: true,
      connected: false,
      profile: null,
      scopes: [],
      canModifyPlaylists: false,
    });
  });

  it("reports the connected profile without exposing tokens", async () => {
    vi.stubEnv("SPOTIFY_CLIENT_ID", "a".repeat(32));
    vi.stubEnv("SPOTIFY_CLIENT_SECRET", "b".repeat(32));
    const response = await session(
      request(
        `hermes_spotify_profile=${profileCookie()}; hermes_spotify_refresh=secret-refresh-token`,
      ),
    );
    const body = await response.json();
    expect(body).toEqual({
      configured: true,
      connected: true,
      profile: {
        id: "user-1",
        displayName: "Premium Listener",
        imageUrl: null,
        product: "premium",
        premium: true,
      },
      scopes: [],
      canModifyPlaylists: false,
    });
    expect(JSON.stringify(body)).not.toContain("secret-refresh-token");
  });

  it("reports playlist editing capability from the granted scopes", async () => {
    vi.stubEnv("SPOTIFY_CLIENT_ID", "a".repeat(32));
    vi.stubEnv("SPOTIFY_CLIENT_SECRET", "b".repeat(32));
    const response = await session(
      request(
        `hermes_spotify_profile=${profileCookie()}; hermes_spotify_refresh=secret-refresh-token; hermes_spotify_scope=streaming%20playlist-modify-private`,
      ),
    );
    const body = await response.json();
    expect(body.canModifyPlaylists).toBe(true);
    expect(body.scopes).toContain("playlist-modify-private");
  });
});
