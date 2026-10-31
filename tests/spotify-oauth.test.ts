import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildAuthorizeUrl,
  exchangeAuthorizationCode,
  fetchSpotifyProfile,
  resolveRedirectUri,
  sanitizeReturnOrigin,
  sanitizeReturnTo,
} from "@/lib/spotify/oauth";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("Spotify OAuth helpers", () => {
  it("builds the authorize URL with streaming scopes and state", () => {
    const url = new URL(
      buildAuthorizeUrl({
        clientId: "client-id",
        redirectUri: "http://localhost:3002/api/auth/spotify/callback",
        state: "state-123",
      }),
    );
    expect(`${url.origin}${url.pathname}`).toBe(
      "https://accounts.spotify.com/authorize",
    );
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("client_id")).toBe("client-id");
    expect(url.searchParams.get("state")).toBe("state-123");
    expect(url.searchParams.get("redirect_uri")).toBe(
      "http://localhost:3002/api/auth/spotify/callback",
    );
    expect(url.searchParams.get("scope")).toContain("streaming");
    expect(url.searchParams.get("scope")).toContain("user-modify-playback-state");
  });

  it("only accepts safe return paths", () => {
    expect(sanitizeReturnTo("/settings")).toBe("/settings");
    expect(sanitizeReturnTo("/search")).toBe("/search");
    expect(sanitizeReturnTo("/library")).toBe("/library");
    expect(sanitizeReturnTo("/stats")).toBe("/stats");
    expect(sanitizeReturnTo("/")).toBe("/");
    expect(sanitizeReturnTo("//evil.example")).toBe("/search");
    expect(sanitizeReturnTo("https://evil.example")).toBe("/search");
    expect(sanitizeReturnTo("/album/album-1")).toBe("/search");
    expect(sanitizeReturnTo(null)).toBe("/search");
  });

  it("uses the configured callback when the dev port drifts on loopback", () => {
    vi.stubEnv(
      "SPOTIFY_REDIRECT_URI",
      "http://localhost:3000/api/auth/spotify/callback",
    );
    expect(resolveRedirectUri("http://localhost:3002")).toBe(
      "http://localhost:3000/api/auth/spotify/callback",
    );
    expect(resolveRedirectUri("http://localhost:3000")).toBe(
      "http://localhost:3000/api/auth/spotify/callback",
    );
  });

  it("uses the configured loopback URI when the browser is on localhost", () => {
    vi.stubEnv(
      "SPOTIFY_REDIRECT_URI",
      "http://127.0.0.1:3002/api/auth/spotify/callback",
    );
    expect(resolveRedirectUri("http://localhost:3002")).toBe(
      "http://127.0.0.1:3002/api/auth/spotify/callback",
    );
    expect(resolveRedirectUri("http://127.0.0.1:3002")).toBe(
      "http://127.0.0.1:3002/api/auth/spotify/callback",
    );
    expect(resolveRedirectUri("http://127.0.0.1:3001")).toBe(
      "http://127.0.0.1:3002/api/auth/spotify/callback",
    );
    expect(resolveRedirectUri("https://hermes.example")).toBe(
      "https://hermes.example/api/auth/spotify/callback",
    );
  });

  it("falls back to the request origin for non-loopback mismatches", () => {
    vi.stubEnv(
      "SPOTIFY_REDIRECT_URI",
      "https://hermes.example/api/auth/spotify/callback",
    );
    expect(resolveRedirectUri("https://preview.example")).toBe(
      "https://preview.example/api/auth/spotify/callback",
    );
  });

  it("only accepts same-host loopback return origins", () => {
    expect(
      sanitizeReturnOrigin("http://127.0.0.1:3002", "http://127.0.0.1:3000"),
    ).toBe("http://127.0.0.1:3002");
    expect(
      sanitizeReturnOrigin("http://localhost:3002", "http://localhost:3000"),
    ).toBe("http://localhost:3002");
    expect(
      sanitizeReturnOrigin("https://evil.example", "http://127.0.0.1:3000"),
    ).toBeNull();
    expect(
      sanitizeReturnOrigin("http://localhost:3002", "http://127.0.0.1:3000"),
    ).toBeNull();
    expect(
      sanitizeReturnOrigin("http://127.0.0.1:3002", "https://hermes.example"),
    ).toBeNull();
    expect(sanitizeReturnOrigin(null, "http://127.0.0.1:3000")).toBeNull();
  });

  it("exchanges an authorization code server-side", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          access_token: "user-access-token",
          refresh_token: "user-refresh-token",
          expires_in: 3600,
          token_type: "Bearer",
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const tokens = await exchangeAuthorizationCode(
      { clientId: "client-id", clientSecret: "client-secret" },
      "auth-code",
      "http://localhost:3002/api/auth/spotify/callback",
    );

    expect(tokens).toMatchObject({
      accessToken: "user-access-token",
      refreshToken: "user-refresh-token",
      expiresIn: 3600,
    });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://accounts.spotify.com/api/token");
    expect((init.headers as Record<string, string>).Authorization).toBe(
      `Basic ${Buffer.from("client-id:client-secret").toString("base64")}`,
    );
    expect(String(init.body)).toContain("grant_type=authorization_code");
    expect(String(init.body)).toContain("redirect_uri=http%3A%2F%2Flocalhost%3A3002");
  });

  it("maps the profile and Premium status", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "user-1",
          display_name: "Listener",
          product: "premium",
          images: [
            { url: "https://i.scdn.co/image/small.jpg", width: 64 },
            { url: "https://i.scdn.co/image/large.jpg", width: 640 },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const profile = await fetchSpotifyProfile("user-access-token");
    expect(profile).toEqual({
      id: "user-1",
      displayName: "Listener",
      imageUrl: "https://i.scdn.co/image/large.jpg",
      product: "premium",
      premium: true,
    });
    expect((fetchMock.mock.calls[0][1] as RequestInit).headers).toMatchObject({
      Authorization: "Bearer user-access-token",
    });
  });

  it("retries a transient token endpoint failure", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            access_token: "recovered-token",
            refresh_token: "recovered-refresh",
            expires_in: 3600,
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    const tokens = await exchangeAuthorizationCode(
      { clientId: "client-id", clientSecret: "client-secret" },
      "auth-code",
      "http://127.0.0.1:3000/api/auth/spotify/callback",
    );

    expect(tokens.accessToken).toBe("recovered-token");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not retry a rejected authorization code", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: "invalid_grant" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      exchangeAuthorizationCode(
        { clientId: "client-id", clientSecret: "client-secret" },
        "bad-code",
        "http://127.0.0.1:3000/api/auth/spotify/callback",
      ),
    ).rejects.toMatchObject({ code: "auth_failed" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries a transient profile lookup failure", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 429 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: "user-1",
            display_name: "Listener",
            product: "premium",
            images: [],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    const profile = await fetchSpotifyProfile("user-access-token");
    expect(profile.id).toBe("user-1");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
