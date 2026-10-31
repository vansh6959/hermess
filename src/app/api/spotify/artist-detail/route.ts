import { NextResponse, type NextRequest } from "next/server";
import {
  getSpotifyApi,
  SpotifyApiError,
  type SpotifyApi,
} from "@/lib/spotify/server";
import {
  attachRefreshedTokens,
  getRequestSpotifyApi,
} from "@/lib/spotify/user-api";
import type { SpotifyArtistDetail } from "@/lib/spotify/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SPOTIFY_ID = /^[A-Za-z0-9_-]{1,128}$/;
const MAX_NAME_LENGTH = 80;
const CACHE_TTL_MS = 30 * 60 * 1_000;
const CACHE_MAX_ENTRIES = 50;

const cache = new Map<
  string,
  { expiresAt: number; data: SpotifyArtistDetail }
>();

function normalize(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function failure(message: string, status: number) {
  return NextResponse.json(
    { error: { code: "unavailable", message } },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

export async function GET(request: NextRequest) {
  const idParam = request.nextUrl.searchParams.get("id")?.trim() ?? "";
  const nameParam = request.nextUrl.searchParams.get("name")?.trim() ?? "";

  if (!idParam && !nameParam) {
    return failure("An artist id or name is required.", 400);
  }
  if (idParam && !SPOTIFY_ID.test(idParam)) {
    return failure("A valid artist is required.", 400);
  }
  if (nameParam.length > MAX_NAME_LENGTH) {
    return failure("The artist name is too long.", 400);
  }

  const { api, access } = await getRequestSpotifyApi(request);
  if (!api) {
    return failure(
      "Playback is not configured on the server. Add the music service credentials to .env.local and restart.",
      503,
    );
  }

  const loadArtist = async (
    client: SpotifyApi,
  ): Promise<SpotifyArtistDetail> => {
    let artistId = idParam;
    if (!artistId) {
      const search = await client.search(nameParam, 10);
      const target = normalize(nameParam);
      const match =
        search.artists.find((artist) => normalize(artist.name) === target) ??
        search.artists[0];
      if (!match) {
        throw new SpotifyApiError("unavailable", "Artist not found.", {
          status: 404,
        });
      }
      artistId = match.id;
    }

    const cached = cache.get(artistId);
    if (cached && cached.expiresAt > Date.now()) return cached.data;

    const [artist, releases, topTracks] = await Promise.all([
      client.artistById(artistId),
      client.artistReleases(artistId),
      client.artistTopTracks(artistId).catch(() => []),
    ]);

    const data: SpotifyArtistDetail = {
      artist,
      albums: releases.filter((release) => release.albumType !== "single"),
      singles: releases.filter((release) => release.albumType === "single"),
      topTracks,
    };

    cache.set(artistId, {
      expiresAt: Date.now() + CACHE_TTL_MS,
      data,
    });
    if (cache.size > CACHE_MAX_ENTRIES) {
      const oldest = cache.keys().next().value;
      if (oldest) cache.delete(oldest);
    }
    return data;
  };

  try {
    // A user token can be rate-limited or rejected while the app's public
    // client credentials are healthy. Artist metadata is public, so retry the
    // same lookup with the client token before falling back to local data.
    const attempts: Array<() => SpotifyApi | null> = [() => api];
    if (access) attempts.push(() => getSpotifyApi());

    let data: SpotifyArtistDetail | null = null;
    let lastError: unknown = null;
    for (const attempt of attempts) {
      const candidate = attempt();
      if (!candidate) continue;
      try {
        data = await loadArtist(candidate);
        break;
      } catch (error) {
        lastError = error;
        if (
          !(error instanceof SpotifyApiError) ||
          error.status === 404 ||
          !["rate_limited", "unavailable", "unauthorized"].includes(error.code)
        ) {
          break;
        }
      }
    }
    if (!data) {
      throw lastError ?? new Error("Artist details could not be loaded.");
    }

    return attachRefreshedTokens(
      NextResponse.json(data, {
        headers: { "Cache-Control": "private, max-age=1800" },
      }),
      access,
      request,
    );
  } catch (error) {
    if (error instanceof SpotifyApiError) {
      console.warn(
        `[spotify] artist detail failed: ${error.code} (${error.status ?? "no status"})`,
      );
      return attachRefreshedTokens(
        failure(
          error.message,
          error.status === 404
            ? 404
            : error.code === "rate_limited"
              ? 429
              : 502,
        ),
        access,
        request,
      );
    }
    console.error("[spotify] unexpected artist detail failure");
    return attachRefreshedTokens(
      failure("Artist details could not be loaded.", 500),
      access,
      request,
    );
  }
}
