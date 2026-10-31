import { NextResponse, type NextRequest } from "next/server";
import {
  attachRefreshedTokens,
  getRequestSpotifyApi,
} from "@/lib/spotify/user-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_NAMES = 5;
const MAX_NAME_LENGTH = 80;
const SEARCH_LIMIT = 3;
const IMAGE_TTL_MS = 6 * 60 * 60 * 1_000;
const NEGATIVE_TTL_MS = 15 * 60 * 1_000;
const CACHE_MAX_ENTRIES = 200;

interface CachedArtistImage {
  imageUrl: string | null;
  expiresAt: number;
}

const cache = new Map<string, CachedArtistImage>();

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
    { error: { code: "invalid_request", message } },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

export async function GET(request: NextRequest) {
  const names = [
    ...new Map(
      request.nextUrl.searchParams
        .getAll("name")
        .map((name) => name.trim())
        .filter(Boolean)
        .map((name) => [normalize(name), name]),
    ).values(),
  ];

  if (names.length === 0) {
    return failure("At least one artist name is required.", 400);
  }
  if (names.length > MAX_NAMES) {
    return failure("Up to five artists can be requested at once.", 400);
  }
  if (names.some((name) => name.length > MAX_NAME_LENGTH)) {
    return failure("Artist names are too long.", 400);
  }

  const { api, access } = await getRequestSpotifyApi(request);
  if (!api) {
    return failure(
      "Artist images are not configured on the server. Add the music service credentials to .env.local and restart.",
      503,
    );
  }

  const now = Date.now();
  const freshKeys = new Set<string>();
  const pending: string[] = [];
  for (const name of names) {
    const key = normalize(name);
    const entry = cache.get(key);
    if (entry && entry.expiresAt > now) freshKeys.add(key);
    else pending.push(name);
  }

  let failures = 0;
  const settled = await Promise.allSettled(
    pending.map(async (name) => {
      const data = await api.search(name, SEARCH_LIMIT);
      const target = normalize(name);
      const match =
        data.artists.find((artist) => normalize(artist.name) === target) ??
        data.artists[0];
      return {
        key: normalize(name),
        imageUrl: match?.imageUrl ?? null,
      };
    }),
  );

  for (const result of settled) {
    if (result.status !== "fulfilled") {
      failures += 1;
      continue;
    }
    const { key, imageUrl } = result.value;
    freshKeys.add(key);
    cache.set(key, {
      imageUrl,
      expiresAt: now + (imageUrl ? IMAGE_TTL_MS : NEGATIVE_TTL_MS),
    });
    if (cache.size > CACHE_MAX_ENTRIES) {
      const oldest = cache.keys().next().value;
      if (oldest) cache.delete(oldest);
    }
  }

  // A transient upstream failure must stay retryable: reporting it as `null`
  // would make the client cache the initials as if the artist had no photo.
  if (
    pending.length > 0 &&
    failures === pending.length &&
    freshKeys.size === 0
  ) {
    return NextResponse.json(
      {
        error: {
          code: "unavailable",
          message: "Artist images are temporarily unavailable.",
        },
        artists: [],
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  const incomplete = failures > 0;
  const artists = names
    .filter((name) => freshKeys.has(normalize(name)))
    .map((name) => ({
      name,
      imageUrl: cache.get(normalize(name))?.imageUrl ?? null,
    }));

  return attachRefreshedTokens(
    NextResponse.json(
      { artists, incomplete },
      {
        headers: {
          "Cache-Control": incomplete ? "no-store" : "private, max-age=3600",
        },
      },
    ),
    access,
    request,
  );
}
