import { NextResponse, type NextRequest } from "next/server";
import { readSpotifyConfig } from "@/lib/spotify/server";
import { refreshUserAccessToken } from "@/lib/spotify/oauth";
import {
  isSecureRequest,
  readSpotifyAuth,
  setRefreshedTokens,
} from "@/lib/spotify/cookies";
import type { SpotifyArtistResult } from "@/lib/spotify/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const API_BASE = "https://api.spotify.com/v1";
const MAX_ARTISTS = 8;
const TIMEOUT_MS = 8_000;

interface SpotifyArtistRef {
  id?: string;
  name?: string;
}

interface SpotifyTrackRef {
  artists?: SpotifyArtistRef[];
}

interface SpotifyQueueBody {
  currently_playing?: SpotifyTrackRef | null;
  queue?: SpotifyTrackRef[];
}

interface SpotifyArtistBody {
  id: string;
  name: string;
  images?: Array<{ url?: string; width?: number }>;
  genres?: string[];
  external_urls?: { spotify?: string };
}

interface SpotifyArtistsBody {
  artists?: Array<SpotifyArtistBody | null>;
}

function response(
  request: NextRequest,
  payload: { connected: boolean; artists: SpotifyArtistResult[] },
  refreshed: Awaited<ReturnType<typeof refreshUserAccessToken>> | null,
) {
  const result = NextResponse.json(payload, {
    headers: { "Cache-Control": "no-store" },
  });
  if (refreshed) {
    setRefreshedTokens(result, refreshed, isSecureRequest(request));
  }
  return result;
}

function collectArtistIds(item: SpotifyTrackRef | null | undefined): string[] {
  return (item?.artists ?? [])
    .map((artist) => artist.id)
    .filter((id): id is string => Boolean(id));
}

function pickArtistImage(images: SpotifyArtistBody["images"]): string | null {
  const available = images?.filter((image) => Boolean(image.url)) ?? [];
  if (available.length === 0) return null;
  const sorted = [...available].sort(
    (a, b) => (a.width ?? 0) - (b.width ?? 0),
  );
  return (
    sorted.find((image) => (image.width ?? 0) >= 280)?.url ??
    sorted[sorted.length - 1]?.url ??
    null
  );
}

export async function GET(request: NextRequest) {
  const config = readSpotifyConfig();
  if (!config) {
    return NextResponse.json(
      { connected: false, artists: [] },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  const auth = readSpotifyAuth(request);
  let token = auth.accessToken;
  let refreshed: Awaited<ReturnType<typeof refreshUserAccessToken>> | null = null;

  if (!token || !auth.expiresAt || auth.expiresAt <= Date.now() + 30_000) {
    if (!auth.refreshToken) {
      return response(request, { connected: false, artists: [] }, null);
    }
    try {
      refreshed = await refreshUserAccessToken(config, auth.refreshToken);
      token = refreshed.accessToken;
    } catch {
      return response(request, { connected: false, artists: [] }, null);
    }
  }

  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
  };
  let items: Array<SpotifyTrackRef | null> = [];

  try {
    const queue = await fetch(`${API_BASE}/me/player/queue`, {
      headers,
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (queue.ok) {
      const data = (await queue.json()) as SpotifyQueueBody;
      items = [data.currently_playing ?? null, ...(data.queue ?? [])];
    } else {
      const player = await fetch(`${API_BASE}/me/player`, {
        headers,
        cache: "no-store",
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (player.ok) {
        const data = (await player.json()) as { item?: SpotifyTrackRef | null };
        items = [data.item ?? null];
      }
    }
  } catch {
    return response(request, { connected: true, artists: [] }, refreshed);
  }

  const ids = [...new Set(items.flatMap(collectArtistIds))].slice(0, MAX_ARTISTS);
  if (ids.length === 0) {
    return response(request, { connected: true, artists: [] }, refreshed);
  }

  try {
    const artists = await fetch(
      `${API_BASE}/artists?ids=${encodeURIComponent(ids.join(","))}`,
      {
        headers,
        cache: "no-store",
        signal: AbortSignal.timeout(TIMEOUT_MS),
      },
    );
    if (!artists.ok) {
      return response(request, { connected: true, artists: [] }, refreshed);
    }
    const data = (await artists.json()) as SpotifyArtistsBody;
    const mapped = (data.artists ?? [])
      .filter((artist): artist is SpotifyArtistBody => Boolean(artist))
      .map<SpotifyArtistResult>((artist) => ({
        id: artist.id,
        name: artist.name,
        imageUrl: pickArtistImage(artist.images),
        genres: (artist.genres ?? []).filter(
          (genre): genre is string => typeof genre === "string",
        ),
        spotifyUrl:
          artist.external_urls?.spotify ??
          `https://open.spotify.com/artist/${artist.id}`,
      }));
    return response(request, { connected: true, artists: mapped }, refreshed);
  } catch {
    return response(request, { connected: true, artists: [] }, refreshed);
  }
}
