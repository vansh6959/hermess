import { describe, expect, it, vi } from "vitest";
import { readSpotifyConfig, SpotifyApi, SpotifyApiError } from "@/lib/spotify/server";

const CONFIG = {
  clientId: "a".repeat(32),
  clientSecret: "b".repeat(32),
};

const TRACK = {
  id: "track-1",
  name: "Glass Hours",
  artists: [{ id: "artist-1", name: "Mira Vale" }],
  album: {
    name: "Glass Hours",
    images: [
      { url: "https://i.scdn.co/image/small.jpg", width: 64, height: 64 },
      { url: "https://i.scdn.co/image/large.jpg", width: 640, height: 640 },
    ],
  },
  duration_ms: 212_000,
  explicit: true,
  external_urls: { spotify: "https://open.spotify.com/track/track-1" },
};

const ALBUM = {
  id: "album-1",
  name: "Glass Hours",
  artists: [{ id: "artist-1", name: "Mira Vale" }],
  images: [{ url: "https://i.scdn.co/image/album.jpg", width: 640, height: 640 }],
  release_date: "2024-04-17",
  total_tracks: 8,
  external_urls: { spotify: "https://open.spotify.com/album/album-1" },
};

const ARTIST = {
  id: "artist-1",
  name: "Mira Vale",
  images: [{ url: "https://i.scdn.co/image/artist.jpg", width: 640, height: 640 }],
  genres: ["dream pop", "ambient pop"],
  followers: { total: 1_234 },
  popularity: 77,
  external_urls: { spotify: "https://open.spotify.com/artist/artist-1" },
};

const SEARCH_BODY = {
  tracks: { items: [TRACK, null] },
  albums: { items: [ALBUM] },
  artists: { items: [ARTIST] },
};

function json(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

function tokenResponse() {
  return json({
    access_token: "spotify-access-token",
    token_type: "Bearer",
    expires_in: 3600,
  });
}

function createFetch(responses: Response[]) {
  const queue = [...responses];
  return vi.fn().mockImplementation(() => {
    const next = queue.shift();
    if (!next) throw new Error("Unexpected fetch call");
    return Promise.resolve(next);
  });
}

function apiWith(fetchMock: ReturnType<typeof vi.fn>, market?: string) {
  return new SpotifyApi(
    { ...CONFIG, ...(market ? { market } : {}) },
    {
      fetchImpl: fetchMock as unknown as typeof fetch,
      now: () => 1_700_000_000_000,
    },
  );
}

describe("readSpotifyConfig", () => {
  it("requires both client credentials", () => {
    expect(readSpotifyConfig({})).toBeNull();
    expect(
      readSpotifyConfig({
        SPOTIFY_CLIENT_ID: "id",
        SPOTIFY_CLIENT_SECRET: "   ",
      }),
    ).toBeNull();
  });

  it("normalizes an optional market", () => {
    const config = readSpotifyConfig({
      SPOTIFY_CLIENT_ID: "client-id",
      SPOTIFY_CLIENT_SECRET: "client-secret",
      SPOTIFY_MARKET: "gb",
    });
    expect(config).toEqual({
      clientId: "client-id",
      clientSecret: "client-secret",
      market: "GB",
    });
  });
});

describe("SpotifyApi.search", () => {
  it("uses server-side Basic auth, maps metadata and caches the token", async () => {
    const fetchMock = createFetch([
      tokenResponse(),
      json(SEARCH_BODY),
      json(SEARCH_BODY),
    ]);
    const api = apiWith(fetchMock);

    const first = await api.search("glass hours");
    const second = await api.search("low tide");

    expect(fetchMock).toHaveBeenCalledTimes(3);

    const [tokenUrl, tokenInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(tokenUrl).toBe("https://accounts.spotify.com/api/token");
    expect(tokenInit.method).toBe("POST");
    expect((tokenInit.headers as Record<string, string>).Authorization).toBe(
      `Basic ${Buffer.from(`${CONFIG.clientId}:${CONFIG.clientSecret}`).toString("base64")}`,
    );

    const [searchUrl, searchInit] = fetchMock.mock.calls[1] as [string, RequestInit];
    const parsedUrl = new URL(searchUrl);
    expect(parsedUrl.origin + parsedUrl.pathname).toBe(
      "https://api.spotify.com/v1/search",
    );
    expect(parsedUrl.searchParams.get("q")).toBe("glass hours");
    expect(parsedUrl.searchParams.get("type")).toBe("track,artist,album");
    expect(parsedUrl.searchParams.get("limit")).toBe("6");
    expect((searchInit.headers as Record<string, string>).Authorization).toBe(
      "Bearer spotify-access-token",
    );

    expect(first.tracks).toHaveLength(1);
    expect(first.tracks[0]).toMatchObject({
      id: "track-1",
      name: "Glass Hours",
      artists: "Mira Vale",
      albumName: "Glass Hours",
      imageUrl: "https://i.scdn.co/image/large.jpg",
      durationMs: 212_000,
      explicit: true,
      spotifyUrl: "https://open.spotify.com/track/track-1",
    });
    expect(first.albums[0]).toMatchObject({
      releaseYear: "2024",
      totalTracks: 8,
      imageUrl: "https://i.scdn.co/image/album.jpg",
    });
    expect(first.artists[0].genres).toEqual(["dream pop", "ambient pop"]);
    expect(second.tracks[0].id).toBe("track-1");
  });

  it("serves repeated searches from its short-lived cache", async () => {
    const fetchMock = createFetch([tokenResponse(), json(SEARCH_BODY)]);
    const api = apiWith(fetchMock);

    await api.search("repeat cache probe");
    await api.search("repeat cache probe");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("uses a provided user access token without a client-credentials exchange", async () => {
    const fetchMock = vi.fn().mockResolvedValue(json(SEARCH_BODY));
    const api = new SpotifyApi(CONFIG, {
      fetchImpl: fetchMock as unknown as typeof fetch,
      now: () => 1_700_000_000_000,
      accessToken: "user-access-token",
    });

    const data = await api.search("owner token probe");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [searchUrl, searchInit] = fetchMock.mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect(new URL(searchUrl).pathname).toBe("/v1/search");
    expect(
      (searchInit.headers as Record<string, string>).Authorization,
    ).toBe("Bearer user-access-token");
    expect(data.tracks).toHaveLength(1);
  });

  it("does not exchange client credentials when the user token is rejected", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(json({ error: { status: 401 } }, 401));
    const api = new SpotifyApi(CONFIG, {
      fetchImpl: fetchMock as unknown as typeof fetch,
      now: () => 1_700_000_000_000,
      accessToken: "rejected-user-token",
    });

    await expect(api.search("owner rejected probe")).rejects.toMatchObject({
      code: "unauthorized",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("sends the optional market and encodes the query", async () => {
    const fetchMock = createFetch([tokenResponse(), json(SEARCH_BODY)]);
    const api = apiWith(fetchMock, "GB");

    await api.search("low tide & rain");

    const [searchUrl] = fetchMock.mock.calls[1] as [string];
    const parsedUrl = new URL(searchUrl);
    expect(parsedUrl.searchParams.get("q")).toBe("low tide & rain");
    expect(parsedUrl.searchParams.get("market")).toBe("GB");
  });

  it("refreshes once when Spotify rejects the cached token", async () => {
    const fetchMock = createFetch([
      tokenResponse(),
      json({ error: { status: 401, message: "expired" } }, 401),
      tokenResponse(),
      json(SEARCH_BODY),
    ]);
    const api = apiWith(fetchMock);

    const data = await api.search("refresh token probe");
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(data.tracks).toHaveLength(1);
  });

  it("maps bad credentials without leaking them", async () => {
    const fetchMock = createFetch([
      json({ error: "invalid_client", error_description: "Invalid client" }, 400),
    ]);
    const api = apiWith(fetchMock);

    let caught: unknown;
    try {
      await api.search("bad credentials probe");
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(SpotifyApiError);
    const apiError = caught as SpotifyApiError;
    expect(apiError.code).toBe("unauthorized");
    expect(apiError.message).not.toContain(CONFIG.clientSecret);
    expect(apiError.message).not.toContain("Invalid client");
  });

  it("surfaces rate limits with Retry-After", async () => {
    const fetchMock = createFetch([
      tokenResponse(),
      json({ error: { status: 429 } }, 429, { "retry-after": "13" }),
    ]);
    const api = apiWith(fetchMock);

    await expect(api.search("rate limit probe")).rejects.toMatchObject({
      code: "rate_limited",
      retryAfter: 13,
    });
  });

  it("maps forbidden API access", async () => {
    const fetchMock = createFetch([
      tokenResponse(),
      json({ error: { status: 403 } }, 403),
    ]);
    const api = apiWith(fetchMock);

    await expect(api.search("forbidden probe")).rejects.toMatchObject({
      code: "forbidden",
    });
  });

  it("rejects malformed JSON without crashing", async () => {
    const fetchMock = createFetch([new Response("not-json", { status: 200 })]);
    const api = apiWith(fetchMock);

    await expect(api.search("malformed probe")).rejects.toMatchObject({
      code: "invalid_response",
    });
  });
});

describe("SpotifyApi.artistTopTracks", () => {
  it("loads ordered top tracks with album artwork", async () => {
    const fetchMock = createFetch([
      tokenResponse(),
      json({ tracks: [TRACK, null] }),
    ]);
    const api = apiWith(fetchMock);

    const tracks = await api.artistTopTracks("artist-1");

    const [topUrl, topInit] = fetchMock.mock.calls[1] as [string, RequestInit];
    const parsedUrl = new URL(topUrl);
    expect(parsedUrl.origin + parsedUrl.pathname).toBe(
      "https://api.spotify.com/v1/artists/artist-1/top-tracks",
    );
    expect(parsedUrl.searchParams.get("market")).toBe("US");
    expect((topInit.headers as Record<string, string>).Authorization).toBe(
      "Bearer spotify-access-token",
    );
    expect(tracks).toEqual([
      {
        id: "track-1",
        name: "Glass Hours",
        artists: "Mira Vale",
        albumName: "Glass Hours",
        imageUrl: "https://i.scdn.co/image/large.jpg",
        durationMs: 212_000,
        explicit: true,
        spotifyUrl: "https://open.spotify.com/track/track-1",
      },
    ]);
  });
});

describe("SpotifyApi.artistById", () => {
  it("loads profile image, followers, genres and popularity", async () => {
    const fetchMock = createFetch([tokenResponse(), json(ARTIST)]);
    const api = apiWith(fetchMock);

    const profile = await api.artistById("artist-1");

    const [url, init] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(url).toBe("https://api.spotify.com/v1/artists/artist-1");
    expect((init.headers as Record<string, string>).Authorization).toBe(
      "Bearer spotify-access-token",
    );
    expect(profile).toEqual({
      id: "artist-1",
      name: "Mira Vale",
      imageUrl: "https://i.scdn.co/image/artist.jpg",
      followers: 1_234,
      genres: ["dream pop", "ambient pop"],
      popularity: 77,
      spotifyUrl: "https://open.spotify.com/artist/artist-1",
    });
  });
});

describe("SpotifyApi.artistReleases", () => {
  it("loads albums and singles with types and release dates", async () => {
    const single = {
      ...ALBUM,
      id: "single-1",
      name: "Morning Light",
      album_type: "single",
      release_date: "2023-02-10",
      total_tracks: 1,
      external_urls: {
        spotify: "https://open.spotify.com/album/single-1",
      },
    };
    const fetchMock = createFetch([
      tokenResponse(),
      json({ items: [ALBUM, single, null], next: null }),
    ]);
    const api = apiWith(fetchMock, "GB");

    const releases = await api.artistReleases("artist-1");

    const [url] = fetchMock.mock.calls[1] as [string];
    const parsedUrl = new URL(url);
    expect(parsedUrl.pathname).toBe("/v1/artists/artist-1/albums");
    expect(parsedUrl.searchParams.get("include_groups")).toBe(
      "album,single,compilation",
    );
    expect(parsedUrl.searchParams.get("market")).toBe("GB");
    expect(releases).toEqual([
      {
        id: "album-1",
        name: "Glass Hours",
        artists: "Mira Vale",
        imageUrl: "https://i.scdn.co/image/album.jpg",
        releaseYear: "2024",
        releaseDate: "2024-04-17",
        totalTracks: 8,
        albumType: "album",
        spotifyUrl: "https://open.spotify.com/album/album-1",
      },
      {
        id: "single-1",
        name: "Morning Light",
        artists: "Mira Vale",
        imageUrl: "https://i.scdn.co/image/album.jpg",
        releaseYear: "2023",
        releaseDate: "2023-02-10",
        totalTracks: 1,
        albumType: "single",
        spotifyUrl: "https://open.spotify.com/album/single-1",
      },
    ]);
  });
});

describe("SpotifyApi.artistAlbums", () => {
  it("loads albums with stable IDs, artwork and market", async () => {
    const fetchMock = createFetch([
      tokenResponse(),
      json({ items: [ALBUM, null] }),
    ]);
    const api = apiWith(fetchMock, "GB");

    const albums = await api.artistAlbums("artist-1");

    const [albumsUrl] = fetchMock.mock.calls[1] as [string];
    const parsedUrl = new URL(albumsUrl);
    expect(parsedUrl.origin + parsedUrl.pathname).toBe(
      "https://api.spotify.com/v1/artists/artist-1/albums",
    );
    expect(parsedUrl.searchParams.get("include_groups")).toBe("album");
    expect(parsedUrl.searchParams.get("market")).toBe("GB");
    expect(albums).toEqual([
      {
        id: "album-1",
        name: "Glass Hours",
        artists: "Mira Vale",
        imageUrl: "https://i.scdn.co/image/album.jpg",
        releaseYear: "2024",
        totalTracks: 8,
        spotifyUrl: "https://open.spotify.com/album/album-1",
      },
    ]);
  });
});
