import "server-only";
import { z } from "zod";
import type {
  SpotifyAlbumResult,
  SpotifyAlbumTracksData,
  SpotifyApiErrorBody,
  SpotifyArtistProfile,
  SpotifyArtistResult,
  SpotifyErrorCode,
  SpotifySearchData,
  SpotifyTrackResult,
} from "./types";

const TOKEN_URL = "https://accounts.spotify.com/api/token";
const API_BASE = "https://api.spotify.com/v1";
const TOKEN_SAFETY_MS = 60_000;
const SEARCH_TTL_MS = 60_000;
const SEARCH_LIMIT = 6;
const CACHE_MAX_ENTRIES = 50;
const REQUEST_TIMEOUT_MS = 8_000;

export interface SpotifyConfig {
  clientId: string;
  clientSecret: string;
  market?: string;
}

interface SpotifyApiOptions {
  fetchImpl?: typeof fetch;
  now?: () => number;
  accessToken?: string;
}

export class SpotifyApiError extends Error {
  readonly code: SpotifyErrorCode;
  readonly status?: number;
  readonly retryAfter?: number;

  constructor(
    code: SpotifyErrorCode,
    message: string,
    options: { status?: number; retryAfter?: number } = {},
  ) {
    super(message);
    this.name = "SpotifyApiError";
    this.code = code;
    this.status = options.status;
    this.retryAfter = options.retryAfter;
  }

  toBody(): SpotifyApiErrorBody {
    return {
      code: this.code,
      message: this.message,
      ...(this.retryAfter ? { retryAfter: this.retryAfter } : {}),
    };
  }
}

const imageSchema = z
  .object({
    url: z.string().url(),
    width: z.number().nullish(),
    height: z.number().nullish(),
  })
  .passthrough();

const externalUrlsSchema = z
  .object({ spotify: z.string().url().optional() })
  .passthrough()
  .nullish();

const simplifiedArtistSchema = z.object({ name: z.string() }).passthrough();

const artistSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    images: z.array(imageSchema).nullish(),
    genres: z.array(z.string()).nullish(),
    followers: z.object({ total: z.number() }).passthrough().nullish(),
    popularity: z.number().nullish(),
    external_urls: externalUrlsSchema,
  })
  .passthrough();

const albumSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    images: z.array(imageSchema).nullish(),
    artists: z.array(simplifiedArtistSchema).nullish(),
    release_date: z.string().nullish(),
    total_tracks: z.number().nullish(),
    album_type: z.string().nullish(),
    external_urls: externalUrlsSchema,
  })
  .passthrough();

const trackSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    artists: z.array(simplifiedArtistSchema).nullish(),
    album: z
      .object({
        name: z.string().nullish(),
        images: z.array(imageSchema).nullish(),
      })
      .passthrough()
      .nullish(),
    duration_ms: z.number().nullish(),
    explicit: z.boolean().nullish(),
    external_urls: externalUrlsSchema,
  })
  .passthrough();

const searchResponseSchema = z
  .object({
    tracks: z
      .object({ items: z.array(trackSchema.nullable()) })
      .passthrough()
      .nullish(),
    albums: z
      .object({ items: z.array(albumSchema.nullable()) })
      .passthrough()
      .nullish(),
    artists: z
      .object({ items: z.array(artistSchema.nullable()) })
      .passthrough()
      .nullish(),
  })
  .passthrough();

const tokenResponseSchema = z
  .object({
    access_token: z.string().min(1),
    expires_in: z.number().positive(),
    token_type: z.string().optional(),
  })
  .passthrough();

const albumIdResponseSchema = z
  .object({ album: z.object({ id: z.string() }).passthrough() })
  .passthrough();

const albumTracksResponseSchema = z
  .object({
    items: z.array(trackSchema.nullable()),
    next: z.string().nullish(),
  })
  .passthrough();

const artistTopTracksResponseSchema = z
  .object({
    tracks: z.array(trackSchema.nullable()),
  })
  .passthrough();

const artistAlbumsResponseSchema = z
  .object({
    items: z.array(albumSchema.nullable()),
    next: z.string().nullish(),
  })
  .passthrough();

function pickImage(
  images: { url: string; width?: number | null }[] | null | undefined,
  minimumWidth = 280,
): string | null {
  if (!images?.length) return null;
  const available = images.filter((image) => Boolean(image.url));
  if (available.length === 0) return null;
  const sorted = [...available].sort(
    (a, b) => (a.width ?? 0) - (b.width ?? 0),
  );
  return (
    sorted.find((image) => (image.width ?? 0) >= minimumWidth)?.url ??
    sorted[sorted.length - 1]?.url ??
    null
  );
}

function spotifyLink(
  type: "track" | "album" | "artist",
  id: string,
  externalUrl?: string | null,
): string {
  return externalUrl ?? `https://open.spotify.com/${type}/${encodeURIComponent(id)}`;
}

export type SpotifyEnv = Record<string, string | undefined>;

export function readSpotifyConfig(
  env: SpotifyEnv = process.env,
): SpotifyConfig | null {
  const clientId = env.SPOTIFY_CLIENT_ID?.trim();
  const clientSecret = env.SPOTIFY_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) return null;

  const market = env.SPOTIFY_MARKET?.trim().toUpperCase();
  return {
    clientId,
    clientSecret,
    ...(market ? { market } : {}),
  };
}

const searchCache = new Map<
  string,
  { expiresAt: number; data: SpotifySearchData }
>();

export class SpotifyApi {
  private readonly config: SpotifyConfig;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => number;
  private readonly accessToken: string | null;
  private token: { value: string; expiresAt: number } | null = null;

  constructor(config: SpotifyConfig, options: SpotifyApiOptions = {}) {
    this.config = config;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.now = options.now ?? Date.now;
    this.accessToken = options.accessToken?.trim() || null;
  }

  async albumTracks(trackId: string): Promise<SpotifyAlbumTracksData> {
    const marketQuery = this.config.market
      ? `?market=${encodeURIComponent(this.config.market)}`
      : "";

    let token = await this.getToken();
    const authorizedGet = (url: string) =>
      this.request(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
        cache: "no-store",
      });

    let trackResponse = await authorizedGet(
      `${API_BASE}/tracks/${encodeURIComponent(trackId)}${marketQuery}`,
    );
    if (trackResponse.status === 401) {
      this.token = null;
      token = await this.getToken(true);
      trackResponse = await authorizedGet(
        `${API_BASE}/tracks/${encodeURIComponent(trackId)}${marketQuery}`,
      );
    }
    if (!trackResponse.ok) {
      throw this.errorFromResponse(trackResponse, "search");
    }

    const albumIdParsed = albumIdResponseSchema.safeParse(
      await this.readJson(trackResponse),
    );
    if (!albumIdParsed.success) {
      throw new SpotifyApiError(
        "invalid_response",
        "The music service returned an unexpected album.",
      );
    }
    const albumId = albumIdParsed.data.album.id;

    return this.fetchAlbum(albumId);
  }

  async albumById(albumId: string): Promise<SpotifyAlbumTracksData> {
    return this.fetchAlbum(albumId);
  }

  async artistTopTracks(artistId: string): Promise<SpotifyTrackResult[]> {
    const market = this.config.market ?? "US";
    let token = await this.getToken();
    const authorizedGet = (url: string) =>
      this.request(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
        cache: "no-store",
      });
    const url = `${API_BASE}/artists/${encodeURIComponent(
      artistId,
    )}/top-tracks?market=${encodeURIComponent(market)}`;

    let response = await authorizedGet(url);
    if (response.status === 401) {
      this.token = null;
      token = await this.getToken(true);
      response = await authorizedGet(url);
    }
    if (!response.ok) throw this.errorFromResponse(response, "search");

    const parsed = artistTopTracksResponseSchema.safeParse(
      await this.readJson(response),
    );
    if (!parsed.success) {
      throw new SpotifyApiError(
        "invalid_response",
        "The music service returned an unexpected artist track list.",
      );
    }

    return parsed.data.tracks
      .filter((track): track is NonNullable<typeof track> => Boolean(track?.id))
      .map((track) => ({
        id: track.id,
        name: track.name,
        artists:
          track.artists
            ?.map((artist) => artist.name)
            .filter(Boolean)
            .join(", ") || "Unknown artist",
        albumName: track.album?.name ?? "",
        imageUrl: pickImage(track.album?.images),
        durationMs: Math.max(0, track.duration_ms ?? 0),
        explicit: Boolean(track.explicit),
        spotifyUrl: spotifyLink("track", track.id, track.external_urls?.spotify),
      }));
  }

  async artistAlbums(artistId: string): Promise<SpotifyAlbumResult[]> {
    const market = this.config.market ?? "US";
    let token = await this.getToken();
    const authorizedGet = (url: string) =>
      this.request(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
        cache: "no-store",
      });
    const url = `${API_BASE}/artists/${encodeURIComponent(
      artistId,
    )}/albums?include_groups=album&market=${encodeURIComponent(
      market,
    )}&limit=20`;

    let response = await authorizedGet(url);
    if (response.status === 401) {
      this.token = null;
      token = await this.getToken(true);
      response = await authorizedGet(url);
    }
    if (!response.ok) throw this.errorFromResponse(response, "search");

    const parsed = artistAlbumsResponseSchema.safeParse(
      await this.readJson(response),
    );
    if (!parsed.success) {
      throw new SpotifyApiError(
        "invalid_response",
        "The music service returned an unexpected artist album list.",
      );
    }

    return parsed.data.items
      .filter((album): album is NonNullable<typeof album> => Boolean(album?.id))
      .map((album) => ({
        id: album.id,
        name: album.name,
        artists:
          album.artists
            ?.map((artist) => artist.name)
            .filter(Boolean)
            .join(", ") || "Unknown artist",
        imageUrl: pickImage(album.images),
        releaseYear: album.release_date?.slice(0, 4) ?? null,
        totalTracks: album.total_tracks ?? 0,
        spotifyUrl: spotifyLink(
          "album",
          album.id,
          album.external_urls?.spotify,
        ),
      }));
  }

  async artistById(artistId: string): Promise<SpotifyArtistProfile> {
    let token = await this.getToken();
    const get = (url: string) =>
      this.request(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
        cache: "no-store",
      });
    const url = `${API_BASE}/artists/${encodeURIComponent(artistId)}`;

    let response = await get(url);
    if (response.status === 401) {
      this.token = null;
      token = await this.getToken(true);
      response = await get(url);
    }
    if (!response.ok) throw this.errorFromResponse(response, "search");

    const parsed = artistSchema.safeParse(await this.readJson(response));
    if (!parsed.success) {
      throw new SpotifyApiError(
        "invalid_response",
        "The music service returned an unexpected artist.",
      );
    }
    const artist = parsed.data;
    return {
      id: artist.id,
      name: artist.name,
      imageUrl: pickImage(artist.images, 320),
      followers: artist.followers?.total ?? null,
      genres: artist.genres ?? [],
      popularity: artist.popularity ?? null,
      spotifyUrl: spotifyLink(
        "artist",
        artist.id,
        artist.external_urls?.spotify,
      ),
    };
  }

  async artistReleases(artistId: string): Promise<SpotifyAlbumResult[]> {
    const market = this.config.market ?? "US";
    let token = await this.getToken();
    const get = (url: string) =>
      this.request(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
        cache: "no-store",
      });

    let nextUrl: string | null = `${API_BASE}/artists/${encodeURIComponent(
      artistId,
    )}/albums?include_groups=${encodeURIComponent(
      "album,single,compilation",
    )}&market=${encodeURIComponent(market)}&limit=50`;
    const seenPages = new Set<string>();
    const seenAlbums = new Set<string>();
    const releases: SpotifyAlbumResult[] = [];

    while (nextUrl && !seenPages.has(nextUrl)) {
      seenPages.add(nextUrl);
      let response = await get(nextUrl);
      if (response.status === 401) {
        this.token = null;
        token = await this.getToken(true);
        response = await get(nextUrl);
      }
      if (!response.ok) throw this.errorFromResponse(response, "search");

      const parsed = artistAlbumsResponseSchema.safeParse(
        await this.readJson(response),
      );
      if (!parsed.success) {
        throw new SpotifyApiError(
          "invalid_response",
          "The music service returned an unexpected artist release list.",
        );
      }

      for (const album of parsed.data.items) {
        if (!album?.id || seenAlbums.has(album.id)) continue;
        seenAlbums.add(album.id);
        releases.push({
          id: album.id,
          name: album.name,
          artists:
            album.artists
              ?.map((artist) => artist.name)
              .filter(Boolean)
              .join(", ") || "Unknown artist",
          imageUrl: pickImage(album.images),
          releaseYear: album.release_date?.slice(0, 4) ?? null,
          releaseDate: album.release_date ?? null,
          totalTracks: album.total_tracks ?? 0,
          albumType: album.album_type ?? "album",
          spotifyUrl: spotifyLink(
            "album",
            album.id,
            album.external_urls?.spotify,
          ),
        });
      }

      nextUrl = parsed.data.next ?? null;
    }

    return releases;
  }

  private async fetchAlbum(albumId: string): Promise<SpotifyAlbumTracksData> {
    const marketQuery = this.config.market
      ? `?market=${encodeURIComponent(this.config.market)}`
      : "";
    const marketSuffix = this.config.market
      ? `&market=${encodeURIComponent(this.config.market)}`
      : "";

    let token = await this.getToken();
    const authorizedGet = (url: string) =>
      this.request(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
        cache: "no-store",
      });

    let albumResponse = await authorizedGet(
      `${API_BASE}/albums/${encodeURIComponent(albumId)}${marketQuery}`,
    );
    if (albumResponse.status === 401) {
      this.token = null;
      token = await this.getToken(true);
      albumResponse = await authorizedGet(
        `${API_BASE}/albums/${encodeURIComponent(albumId)}${marketQuery}`,
      );
    }
    if (!albumResponse.ok) {
      throw this.errorFromResponse(albumResponse, "search");
    }
    const albumParsed = albumSchema.safeParse(
      await this.readJson(albumResponse),
    );
    if (!albumParsed.success) {
      throw new SpotifyApiError(
        "invalid_response",
        "The music service returned an unexpected album.",
      );
    }
    const albumData = albumParsed.data;
    const imageUrl = pickImage(albumData.images);
    const album: SpotifyAlbumResult = {
      id: albumData.id,
      name: albumData.name,
      artists:
        albumData.artists
          ?.map((artist) => artist.name)
          .filter(Boolean)
          .join(", ") || "Unknown artist",
      imageUrl,
      releaseYear: albumData.release_date?.slice(0, 4) ?? null,
      totalTracks: albumData.total_tracks ?? 0,
      spotifyUrl: spotifyLink(
        "album",
        albumData.id,
        albumData.external_urls?.spotify,
      ),
    };

    const tracks: SpotifyTrackResult[] = [];
    let nextUrl: string | null = `${API_BASE}/albums/${encodeURIComponent(albumId)}/tracks?limit=50${marketSuffix}`;
    while (nextUrl) {
      const pageResponse = await authorizedGet(nextUrl);
      if (!pageResponse.ok) {
        throw this.errorFromResponse(pageResponse, "search");
      }
      const pageParsed = albumTracksResponseSchema.safeParse(
        await this.readJson(pageResponse),
      );
      if (!pageParsed.success) {
        throw new SpotifyApiError(
          "invalid_response",
          "The music service returned an unexpected album track list.",
        );
      }
      for (const track of pageParsed.data.items) {
        if (!track) continue;
        tracks.push({
          id: track.id,
          name: track.name,
          artists:
            track.artists
              ?.map((artist) => artist.name)
              .filter(Boolean)
              .join(", ") || "Unknown artist",
          albumName: album.name,
          imageUrl,
          durationMs: Math.max(0, track.duration_ms ?? 0),
          explicit: Boolean(track.explicit),
          spotifyUrl: spotifyLink(
            "track",
            track.id,
            track.external_urls?.spotify,
          ),
        });
      }
      nextUrl = pageParsed.data.next ?? null;
    }

    return { album, tracks };
  }

  async search(rawQuery: string, limit = SEARCH_LIMIT): Promise<SpotifySearchData> {
    const query = rawQuery.trim();
    const scope = this.accessToken ? "user" : "client";
    const cacheKey = `${scope}|${query.toLowerCase()}|${limit}|${this.config.market ?? ""}`;
    const cached = searchCache.get(cacheKey);
    const now = this.now();
    if (cached && cached.expiresAt > now) return cached.data;

    let token = await this.getToken();
    let response = await this.requestSearch(query, limit, token);

    if (response.status === 401) {
      // Credentials are valid but the cached token was revoked/expired early.
      this.token = null;
      token = await this.getToken(true);
      response = await this.requestSearch(query, limit, token);
    }

    if (!response.ok) throw this.errorFromResponse(response, "search");

    const payload = await this.readJson(response);
    const parsed = searchResponseSchema.safeParse(payload);
    if (!parsed.success) {
      throw new SpotifyApiError(
        "invalid_response",
        "The music service returned an unexpected response.",
      );
    }

    const data = this.mapSearch(query, parsed.data);
    searchCache.set(cacheKey, { expiresAt: now + SEARCH_TTL_MS, data });
    if (searchCache.size > CACHE_MAX_ENTRIES) {
      const oldest = searchCache.keys().next().value;
      if (oldest) searchCache.delete(oldest);
    }
    return data;
  }

  private async getToken(force = false): Promise<string> {
    if (this.accessToken) {
      if (force) {
        throw new SpotifyApiError(
          "unauthorized",
          "The Spotify session expired. Reconnect your account.",
          { status: 401 },
        );
      }
      return this.accessToken;
    }
    if (!force && this.token && this.now() < this.token.expiresAt) {
      return this.token.value;
    }

    const basic = Buffer.from(
      `${this.config.clientId}:${this.config.clientSecret}`,
    ).toString("base64");

    const response = await this.request(TOKEN_URL, {
      method: "POST",
      headers: {
        Authorization: `Basic ${basic}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ grant_type: "client_credentials" }).toString(),
      cache: "no-store",
    });

    if (!response.ok) throw this.errorFromResponse(response, "token");

    const payload = await this.readJson(response);
    const parsed = tokenResponseSchema.safeParse(payload);
    if (!parsed.success) {
      throw new SpotifyApiError(
        "invalid_response",
        "The music service returned an unexpected authentication response.",
      );
    }

    const expiresIn = Math.max(30, parsed.data.expires_in);
    this.token = {
      value: parsed.data.access_token,
      expiresAt: this.now() + expiresIn * 1000 - TOKEN_SAFETY_MS,
    };
    return this.token.value;
  }

  private async requestSearch(
    query: string,
    limit: number,
    token: string,
  ): Promise<Response> {
    const params = new URLSearchParams({
      q: query,
      type: "track,artist,album",
      limit: String(limit),
    });
    if (this.config.market) params.set("market", this.config.market);

    return this.request(`${API_BASE}/search?${params.toString()}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
      cache: "no-store",
    });
  }

  private async request(input: string, init: RequestInit): Promise<Response> {
    try {
      return await this.fetchImpl(input, {
        ...init,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch {
      throw new SpotifyApiError(
        "network",
        "Could not reach the music service. Check the server connection and try again.",
      );
    }
  }

  private async readJson(response: Response): Promise<unknown> {
    try {
      return await response.json();
    } catch {
      throw new SpotifyApiError(
        "invalid_response",
        "The music service returned an unreadable response.",
      );
    }
  }

  private retryAfter(response: Response): number | undefined {
    const value = response.headers.get("retry-after");
    if (!value) return undefined;
    const seconds = Number(value);
    return Number.isFinite(seconds) && seconds > 0 ? Math.ceil(seconds) : undefined;
  }

  private errorFromResponse(
    response: Response,
    phase: "token" | "search",
  ): SpotifyApiError {
    const retryAfter = this.retryAfter(response);
    if (response.status === 429) {
      return new SpotifyApiError(
        "rate_limited",
        retryAfter
          ? `Service rate limit reached. Try again in ${retryAfter}s.`
          : "Service rate limit reached. Try again shortly.",
        { status: response.status, retryAfter },
      );
    }
    if (response.status === 401 || (phase === "token" && response.status === 400)) {
      return new SpotifyApiError(
        "unauthorized",
        "The music service rejected the server credentials.",
        { status: response.status },
      );
    }
    if (response.status === 403) {
      return new SpotifyApiError(
        "forbidden",
        "The music service denied this request. Check the app’s Web API access.",
        { status: response.status },
      );
    }
    return new SpotifyApiError(
      "unavailable",
      "The music service is temporarily unavailable.",
      { status: response.status },
    );
  }

  private mapSearch(
    query: string,
    data: z.infer<typeof searchResponseSchema>,
  ): SpotifySearchData {
    const tracks = (data.tracks?.items ?? [])
      .filter((item): item is NonNullable<typeof item> => Boolean(item))
      .map<SpotifyTrackResult>((track) => ({
        id: track.id,
        name: track.name,
        artists:
          track.artists
            ?.map((artist) => artist.name)
            .filter(Boolean)
            .join(", ") || "Unknown artist",
        albumName: track.album?.name ?? "Single",
        imageUrl: pickImage(track.album?.images),
        durationMs: Math.max(0, track.duration_ms ?? 0),
        explicit: Boolean(track.explicit),
        spotifyUrl: spotifyLink("track", track.id, track.external_urls?.spotify),
      }));

    const albums = (data.albums?.items ?? [])
      .filter((item): item is NonNullable<typeof item> => Boolean(item))
      .map<SpotifyAlbumResult>((album) => ({
        id: album.id,
        name: album.name,
        artists:
          album.artists
            ?.map((artist) => artist.name)
            .filter(Boolean)
            .join(", ") || "Unknown artist",
        imageUrl: pickImage(album.images),
        releaseYear: album.release_date?.slice(0, 4) ?? null,
        totalTracks: album.total_tracks ?? 0,
        spotifyUrl: spotifyLink("album", album.id, album.external_urls?.spotify),
      }));

    const artists = (data.artists?.items ?? [])
      .filter((item): item is NonNullable<typeof item> => Boolean(item))
      .map<SpotifyArtistResult>((artist) => ({
        id: artist.id,
        name: artist.name,
        imageUrl: pickImage(artist.images),
        genres: artist.genres?.filter(Boolean) ?? [],
        spotifyUrl: spotifyLink("artist", artist.id, artist.external_urls?.spotify),
      }));

    return {
      query,
      fetchedAt: new Date(this.now()).toISOString(),
      tracks,
      albums,
      artists,
    };
  }
}

let spotifyApi: SpotifyApi | null = null;
let spotifyApiFingerprint: string | null = null;

export function getSpotifyApi(env: SpotifyEnv = process.env): SpotifyApi | null {
  const config = readSpotifyConfig(env);
  if (!config) return null;
  const fingerprint = `${config.clientId}:${config.market ?? ""}`;
  if (!spotifyApi || fingerprint !== spotifyApiFingerprint) {
    spotifyApi = new SpotifyApi(config);
    spotifyApiFingerprint = fingerprint;
  }
  return spotifyApi;
}

export function createUserSpotifyApi(
  config: SpotifyConfig,
  accessToken: string,
): SpotifyApi {
  return new SpotifyApi(config, { accessToken });
}
