import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => {
  class FakeSpotifyApiError extends Error {
    readonly code: string;
    readonly status?: number;
    readonly retryAfter?: number;

    constructor(
      code: string,
      message: string,
      options: { status?: number; retryAfter?: number } = {},
    ) {
      super(message);
      this.name = "SpotifyApiError";
      this.code = code;
      this.status = options.status;
      this.retryAfter = options.retryAfter;
    }

    toBody() {
      return {
        code: this.code,
        message: this.message,
        ...(this.retryAfter ? { retryAfter: this.retryAfter } : {}),
      };
    }
  }

  return {
    getSpotifyApi: vi.fn(),
    getRequestSpotifyApi: vi.fn(),
    FakeSpotifyApiError,
  };
});

vi.mock("@/lib/spotify/server", () => ({
  getSpotifyApi: mocks.getSpotifyApi,
  SpotifyApiError: mocks.FakeSpotifyApiError,
}));

vi.mock("@/lib/spotify/user-api", () => ({
  getRequestSpotifyApi: mocks.getRequestSpotifyApi,
  attachRefreshedTokens: (response: unknown) => response,
}));

import { GET } from "@/app/api/spotify/search/route";

function request(query = "test") {
  return new NextRequest(
    `http://localhost:3000/api/spotify/search?q=${encodeURIComponent(query)}`,
  );
}

const data = {
  query: "test",
  fetchedAt: "2026-10-25T00:00:00.000Z",
  tracks: [],
  albums: [],
  artists: [],
};

beforeEach(() => {
  mocks.getSpotifyApi.mockReset();
  mocks.getRequestSpotifyApi.mockReset();
  mocks.getRequestSpotifyApi.mockImplementation(async () => ({
    api: mocks.getSpotifyApi(),
    access: null,
  }));
});

describe("Spotify search route", () => {
  it("validates the query before touching Spotify", async () => {
    const response = await GET(request("a"));
    expect(response.status).toBe(400);
    expect(mocks.getSpotifyApi).not.toHaveBeenCalled();
    const body = await response.json();
    expect(body.error.code).toBe("invalid_query");
  });

  it("reports missing server configuration", async () => {
    mocks.getSpotifyApi.mockReturnValue(null);
    const response = await GET(request());
    expect(response.status).toBe(503);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    const body = await response.json();
    expect(body.error.code).toBe("not_configured");
    expect(body.error.message).toContain(".env.local");
  });

  it("returns sanitized results with a private cache header", async () => {
    const search = vi.fn().mockResolvedValue(data);
    mocks.getSpotifyApi.mockReturnValue({ search });
    const response = await GET(request("glass hours"));
    expect(response.status).toBe(200);
    expect(search).toHaveBeenCalledWith("glass hours");
    expect(response.headers.get("Cache-Control")).toBe("private, max-age=30");
    const body = await response.json();
    expect(body).toEqual({ provider: "spotify", ...data });
    expect(JSON.stringify(body)).not.toContain("access_token");
  });

  it("maps rate limits and exposes Retry-After", async () => {
    const search = vi
      .fn()
      .mockRejectedValue(
        new mocks.FakeSpotifyApiError("rate_limited", "Slow down.", {
          status: 429,
          retryAfter: 7,
        }),
      );
    mocks.getSpotifyApi.mockReturnValue({ search });
    const response = await GET(request());
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("7");
    const body = await response.json();
    expect(body.error.code).toBe("rate_limited");
  });

  it("falls back to client credentials when the user token is rate-limited", async () => {
    const userSearch = vi
      .fn()
      .mockRejectedValue(
        new mocks.FakeSpotifyApiError("rate_limited", "Slow down.", {
          status: 429,
          retryAfter: 31_754,
        }),
      );
    const clientSearch = vi.fn().mockResolvedValue(data);
    mocks.getRequestSpotifyApi.mockResolvedValue({
      api: { search: userSearch },
      access: { token: "user-token" },
    });
    mocks.getSpotifyApi.mockReturnValue({ search: clientSearch });

    const response = await GET(request("glass hours"));

    expect(response.status).toBe(200);
    expect(clientSearch).toHaveBeenCalledWith("glass hours");
    expect((await response.json()).provider).toBe("spotify");
  });

  it("reports the shorter retry when both tokens are limited", async () => {
    const userSearch = vi
      .fn()
      .mockRejectedValue(
        new mocks.FakeSpotifyApiError("rate_limited", "Slow down.", {
          status: 429,
          retryAfter: 31_754,
        }),
      );
    const clientSearch = vi
      .fn()
      .mockRejectedValue(
        new mocks.FakeSpotifyApiError("rate_limited", "Slow down.", {
          status: 429,
          retryAfter: 30,
        }),
      );
    mocks.getRequestSpotifyApi.mockResolvedValue({
      api: { search: userSearch },
      access: { token: "user-token" },
    });
    mocks.getSpotifyApi.mockReturnValue({ search: clientSearch });

    const response = await GET(request());

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("30");
  });

  it("maps credential failures without exposing details", async () => {
    const search = vi
      .fn()
      .mockRejectedValue(
        new mocks.FakeSpotifyApiError("unauthorized", "Spotify rejected the server credentials."),
      );
    mocks.getSpotifyApi.mockReturnValue({ search });
    const response = await GET(request());
    expect(response.status).toBe(502);
    const body = await response.json();
    expect(body.error.code).toBe("unauthorized");
    expect(JSON.stringify(body)).not.toContain("Basic ");
    expect(JSON.stringify(body)).not.toContain("client_secret");
  });
});
