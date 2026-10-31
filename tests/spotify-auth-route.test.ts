import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET as login } from "@/app/api/auth/spotify/login/route";
import { GET as callback } from "@/app/api/auth/spotify/callback/route";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

function stubCredentials() {
  vi.stubEnv("SPOTIFY_CLIENT_ID", "a".repeat(32));
  vi.stubEnv("SPOTIFY_CLIENT_SECRET", "b".repeat(32));
  vi.stubEnv(
    "SPOTIFY_REDIRECT_URI",
    "http://localhost:3000/api/auth/spotify/callback",
  );
}

function oauthCookieName(state: string) {
  return `hermes_spotify_oauth_${state}`;
}

function cookieNameFromSetCookie(setCookie: string) {
  return /^([^=]+)=/.exec(setCookie)?.[1] ?? "";
}

describe("Spotify auth routes", () => {
  it("routes a drifted dev port through the configured callback origin", async () => {
    stubCredentials();
    const response = await login(
      new NextRequest(
        "http://localhost:3002/api/auth/spotify/login?returnTo=/settings",
      ),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/api/auth/spotify/login?returnTo=%2Fsettings&returnOrigin=http%3A%2F%2Flocalhost%3A3002",
    );
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(response.headers.get("cache-control")).toContain("no-store");

    const canonicalResponse = await login(
      new NextRequest(
        "http://localhost:3000/api/auth/spotify/login?returnTo=/settings&returnOrigin=http%3A%2F%2Flocalhost%3A3002",
      ),
    );
    const location = new URL(canonicalResponse.headers.get("location") ?? "");
    expect(`${location.origin}${location.pathname}`).toBe(
      "https://accounts.spotify.com/authorize",
    );
    expect(location.searchParams.get("redirect_uri")).toBe(
      "http://localhost:3000/api/auth/spotify/callback",
    );
    expect(location.searchParams.get("scope")).toContain("streaming");
    expect(location.searchParams.get("state")).toBeTruthy();

    const setCookie = canonicalResponse.headers.get("set-cookie") ?? "";
    const cookieName = cookieNameFromSetCookie(setCookie);
    expect(cookieName).toMatch(/^hermes_spotify_oauth_/);
    const raw = new RegExp(`${cookieName}=([^;]+)`).exec(setCookie)?.[1];
    const stored = JSON.parse(
      Buffer.from(raw ?? "", "base64url").toString("utf8"),
    );
    expect(stored.returnOrigin).toBe("http://localhost:3002");
    expect(setCookie).toMatch(/max-age=1800/i);
    expect(canonicalResponse.headers.get("cache-control")).toContain("no-store");
  });

  it("moves login to the registered loopback host without a cross-host return", async () => {
    stubCredentials();
    vi.stubEnv(
      "SPOTIFY_REDIRECT_URI",
      "http://127.0.0.1:3002/api/auth/spotify/callback",
    );

    const fromLocalhost = await login(
      new NextRequest(
        "http://localhost:3002/api/auth/spotify/login?returnTo=/settings",
        { headers: { host: "localhost:3002" } },
      ),
    );
    expect(fromLocalhost.status).toBe(307);
    expect(fromLocalhost.headers.get("location")).toBe(
      "http://127.0.0.1:3002/api/auth/spotify/login?returnTo=%2Fsettings",
    );
    expect(fromLocalhost.headers.get("set-cookie")).toBeNull();
    expect(fromLocalhost.headers.get("cache-control")).toContain("no-store");

    const fromLoopback = await login(
      new NextRequest(
        "http://127.0.0.1:3002/api/auth/spotify/login?returnTo=/settings",
        { headers: { host: "127.0.0.1:3002" } },
      ),
    );
    const authorize = new URL(fromLoopback.headers.get("location") ?? "");
    expect(authorize.origin).toBe("https://accounts.spotify.com");
    expect(authorize.searchParams.get("redirect_uri")).toBe(
      "http://127.0.0.1:3002/api/auth/spotify/callback",
    );
    expect(fromLoopback.headers.get("set-cookie")).toContain(
      "hermes_spotify_oauth",
    );
  });

  it("preserves the originating loopback port across the canonical hop", async () => {
    stubCredentials();
    vi.stubEnv(
      "SPOTIFY_REDIRECT_URI",
      "http://127.0.0.1:3000/api/auth/spotify/callback",
    );

    const response = await login(
      new NextRequest(
        "http://127.0.0.1:3002/api/auth/spotify/login?returnTo=/settings",
        { headers: { host: "127.0.0.1:3002" } },
      ),
    );
    expect(response.headers.get("location")).toBe(
      "http://127.0.0.1:3000/api/auth/spotify/login?returnTo=%2Fsettings&returnOrigin=http%3A%2F%2F127.0.0.1%3A3002",
    );
  });

  it("returns to the app with a configuration error when keys are missing", async () => {
    vi.stubEnv("SPOTIFY_CLIENT_ID", "");
    vi.stubEnv("SPOTIFY_CLIENT_SECRET", "");
    const response = await login(
      new NextRequest(
        "http://localhost:3002/api/auth/spotify/login?returnTo=/settings",
      ),
    );
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "http://localhost:3002/settings?spotify=not_configured",
    );
  });

  it("rejects a callback with an invalid OAuth state", async () => {
    const response = await callback(
      new NextRequest(
        "http://localhost:3002/api/auth/spotify/callback?code=code&state=untrusted",
      ),
    );
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "http://localhost:3002/search?spotify=state_error",
    );
    expect(response.headers.get("cache-control")).toContain("no-store");
  });

  it("exchanges a valid callback and stores server-side session cookies", async () => {
    stubCredentials();
    const state = "state-123";
    const oauthCookie = Buffer.from(
      JSON.stringify({
        state,
        redirectUri: "http://localhost:3002/api/auth/spotify/callback",
        returnTo: "/search",
      }),
      "utf8",
    ).toString("base64url");

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            access_token: "user-access",
            refresh_token: "user-refresh",
            expires_in: 3600,
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: "user-1",
            display_name: "Premium Listener",
            product: "premium",
            images: [],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    const request = new NextRequest(
      `http://localhost:3002/api/auth/spotify/callback?code=code&state=${state}`,
      { headers: { cookie: `${oauthCookieName(state)}=${oauthCookie}` } },
    );
    const response = await callback(request);

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "http://localhost:3002/search?spotify=connected",
    );
    const setCookie = response.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("hermes_spotify_access=");
    expect(setCookie).toContain("hermes_spotify_refresh=");
    expect(setCookie).toContain("hermes_spotify_profile=");
  });

  it("returns to the originating loopback port after the callback", async () => {
    const state = "state-123";
    const oauthCookie = Buffer.from(
      JSON.stringify({
        state,
        redirectUri: "http://127.0.0.1:3000/api/auth/spotify/callback",
        returnTo: "/settings",
        returnOrigin: "http://127.0.0.1:3002",
      }),
      "utf8",
    ).toString("base64url");

    const response = await callback(
      new NextRequest(
        `http://127.0.0.1:3000/api/auth/spotify/callback?state=${state}`,
        {
          headers: {
            host: "127.0.0.1:3000",
            cookie: `${oauthCookieName(state)}=${oauthCookie}`,
          },
        },
      ),
    );
    expect(response.headers.get("location")).toBe(
      "http://127.0.0.1:3002/settings?spotify=missing_code",
    );
  });

  it("ignores a return origin on another host", async () => {
    const state = "state-123";
    const oauthCookie = Buffer.from(
      JSON.stringify({
        state,
        redirectUri: "http://127.0.0.1:3000/api/auth/spotify/callback",
        returnTo: "/settings",
        returnOrigin: "https://evil.example",
      }),
      "utf8",
    ).toString("base64url");

    const response = await callback(
      new NextRequest(
        `http://127.0.0.1:3000/api/auth/spotify/callback?state=${state}`,
        {
          headers: {
            host: "127.0.0.1:3000",
            cookie: `${oauthCookieName(state)}=${oauthCookie}`,
          },
        },
      ),
    );
    expect(response.headers.get("location")).toBe(
      "http://127.0.0.1:3000/settings?spotify=missing_code",
    );
  });

  it("keeps concurrent OAuth attempts independent", async () => {
    stubCredentials();

    const firstLogin = await login(
      new NextRequest(
        "http://localhost:3000/api/auth/spotify/login?returnTo=/settings",
        { headers: { host: "localhost:3000" } },
      ),
    );
    const firstAuthorize = new URL(firstLogin.headers.get("location") ?? "");
    const firstState = firstAuthorize.searchParams.get("state") ?? "";
    const firstCookie = firstLogin.headers.get("set-cookie") ?? "";

    const secondLogin = await login(
      new NextRequest(
        "http://localhost:3000/api/auth/spotify/login?returnTo=/search",
        { headers: { host: "localhost:3000" } },
      ),
    );
    const secondAuthorize = new URL(secondLogin.headers.get("location") ?? "");
    const secondState = secondAuthorize.searchParams.get("state") ?? "";
    const secondCookie = secondLogin.headers.get("set-cookie") ?? "";

    expect(firstState).not.toBe(secondState);
    expect(cookieNameFromSetCookie(firstCookie)).toBe(
      oauthCookieName(firstState),
    );
    expect(cookieNameFromSetCookie(secondCookie)).toBe(
      oauthCookieName(secondState),
    );

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            access_token: "user-access",
            refresh_token: "user-refresh",
            expires_in: 3600,
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: "user-1",
            display_name: "Premium Listener",
            product: "premium",
            images: [],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    const cookieHeader = [firstCookie, secondCookie]
      .map((value) => value.split(";")[0])
      .join("; ");
    const response = await callback(
      new NextRequest(
        `http://localhost:3000/api/auth/spotify/callback?code=code&state=${firstState}`,
        { headers: { host: "localhost:3000", cookie: cookieHeader } },
      ),
    );

    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/settings?spotify=connected",
    );
  });
});
