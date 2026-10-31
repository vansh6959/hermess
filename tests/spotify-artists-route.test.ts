import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getRequestSpotifyApi: vi.fn(),
}));

vi.mock("@/lib/spotify/user-api", () => ({
  getRequestSpotifyApi: mocks.getRequestSpotifyApi,
  attachRefreshedTokens: (response: unknown) => response,
}));

import { GET } from "@/app/api/spotify/artists/route";

function request(names: string[]) {
  const params = new URLSearchParams();
  for (const name of names) params.append("name", name);
  return new NextRequest(
    `http://127.0.0.1:3000/api/spotify/artists?${params.toString()}`,
  );
}

function apiWith(
  search: (name: string, limit: number) => Promise<unknown>,
) {
  return { api: { search }, access: null };
}

beforeEach(() => {
  mocks.getRequestSpotifyApi.mockReset();
});

describe("Spotify artist image route", () => {
  it("validates names before touching Spotify", async () => {
    const empty = await GET(request([]));
    expect(empty.status).toBe(400);
    expect((await empty.json()).error.code).toBe("invalid_request");

    const tooMany = await GET(
      request(["A", "B", "C", "D", "E", "F"]),
    );
    expect(tooMany.status).toBe(400);

    const tooLong = await GET(request(["x".repeat(81)]));
    expect(tooLong.status).toBe(400);
    expect(mocks.getRequestSpotifyApi).not.toHaveBeenCalled();
  });

  it("reports missing server configuration", async () => {
    mocks.getRequestSpotifyApi.mockResolvedValue({ api: null, access: null });
    const response = await GET(request(["The Weeknd"]));
    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body.error.code).toBe("invalid_request");
    expect(body.error.message).toContain(".env.local");
  });

  it("prefers exact artist matches, dedupes names, and returns real image URLs", async () => {
    const search = vi.fn(async (name: string) => ({
      artists: [
        { name: `${name} Tribute`, imageUrl: "https://i.scdn.co/tribute" },
        {
          name,
          imageUrl: `https://i.scdn.co/${encodeURIComponent(name)}`,
        },
      ],
    }));
    mocks.getRequestSpotifyApi.mockResolvedValue(apiWith(search));

    const response = await GET(
      request([
        "Exact Match Artist Unique",
        "Second Exact Artist Unique",
        "Exact Match Artist Unique",
      ]),
    );
    expect(response.status).toBe(200);
    expect(search).toHaveBeenCalledTimes(2);
    expect(response.headers.get("Cache-Control")).toBe(
      "private, max-age=3600",
    );
    const body = await response.json();
    expect(body.artists).toEqual([
      {
        name: "Exact Match Artist Unique",
        imageUrl:
          "https://i.scdn.co/Exact%20Match%20Artist%20Unique",
      },
      {
        name: "Second Exact Artist Unique",
        imageUrl:
          "https://i.scdn.co/Second%20Exact%20Artist%20Unique",
      },
    ]);
    expect(JSON.stringify(body)).not.toContain("access_token");
  });

  it("omits transient failures instead of caching them as missing images", async () => {
    const search = vi.fn(async (name: string) => {
      if (name.includes("Missing")) throw new Error("upstream failed");
      return {
        artists: [{ name, imageUrl: "https://i.scdn.co/partial-good" }],
      };
    });
    mocks.getRequestSpotifyApi.mockResolvedValue(apiWith(search));

    const response = await GET(
      request(["Partial Good Artist Unique", "Partial Missing Artist Unique"]),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    const body = await response.json();
    expect(body.incomplete).toBe(true);
    expect(body.artists).toEqual([
      {
        name: "Partial Good Artist Unique",
        imageUrl: "https://i.scdn.co/partial-good",
      },
    ]);
  });

  it("does not cache a failed lookup and retries it on the next request", async () => {
    const search = vi
      .fn()
      .mockRejectedValueOnce(new Error("rate limited"))
      .mockResolvedValue({
        artists: [
          {
            name: "Transient Artist Unique",
            imageUrl: "https://i.scdn.co/transient",
          },
        ],
      });
    mocks.getRequestSpotifyApi.mockResolvedValue(apiWith(search));

    const failed = await GET(request(["Transient Artist Unique"]));
    expect(failed.status).toBe(503);
    expect(failed.headers.get("Cache-Control")).toBe("no-store");
    expect((await failed.json()).artists).toEqual([]);

    const recovered = await GET(request(["Transient Artist Unique"]));
    expect(recovered.status).toBe(200);
    expect((await recovered.json()).artists).toEqual([
      {
        name: "Transient Artist Unique",
        imageUrl: "https://i.scdn.co/transient",
      },
    ]);
  });

  it("keeps already cached images when a new lookup fails", async () => {
    const search = vi.fn(async (name: string) => {
      if (name.includes("Missing")) throw new Error("upstream failed");
      return {
        artists: [{ name, imageUrl: "https://i.scdn.co/cached-good" }],
      };
    });
    mocks.getRequestSpotifyApi.mockResolvedValue(apiWith(search));

    const warm = await GET(request(["Cached Good Artist Unique"]));
    expect(warm.status).toBe(200);

    const mixed = await GET(
      request(["Cached Good Artist Unique", "Cached Missing Artist Unique"]),
    );
    expect(mixed.status).toBe(200);
    expect(mixed.headers.get("Cache-Control")).toBe("no-store");
    const body = await mixed.json();
    expect(body.incomplete).toBe(true);
    expect(body.artists).toEqual([
      {
        name: "Cached Good Artist Unique",
        imageUrl: "https://i.scdn.co/cached-good",
      },
    ]);
  });

  it("caches resolved images between requests", async () => {
    const search = vi.fn(async (name: string) => ({
      artists: [{ name, imageUrl: "https://i.scdn.co/cached" }],
    }));
    mocks.getRequestSpotifyApi.mockResolvedValue(apiWith(search));

    const first = await GET(request(["Cache Artist Unique"]));
    const second = await GET(request(["Cache Artist Unique"]));
    expect((await first.json()).artists[0].imageUrl).toBe(
      "https://i.scdn.co/cached",
    );
    expect((await second.json()).artists[0].imageUrl).toBe(
      "https://i.scdn.co/cached",
    );
    expect(search).toHaveBeenCalledTimes(1);
  });
});
