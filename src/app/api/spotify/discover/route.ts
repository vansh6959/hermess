import { NextResponse, type NextRequest } from "next/server";
import {
  attachRefreshedTokens,
  getRequestSpotifyApi,
} from "@/lib/spotify/user-api";
import {
  buildCuratedDiscover,
  DISCOVERY_ARTISTS,
  type DiscoverCover,
} from "@/lib/spotify/discover";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COMPLETE_CACHE_MS = 60 * 60 * 1000;
const PARTIAL_CACHE_MS = 5 * 60 * 1000;
const FAILURE_COOLDOWN_MS = 60 * 1000;

interface DiscoverCache {
  at: number;
  covers: DiscoverCover[];
  complete: boolean;
}

// Versioned key: do not reuse the old artist-image-only cache after this
// implementation starts returning verified albums.
const cacheHolder = globalThis as typeof globalThis & {
  __hermesDiscoverCacheV2?: DiscoverCache | null;
};

function response(covers: DiscoverCover[], complete: boolean) {
  const maxAge = covers.length === 0 ? 0 : complete ? 3600 : 300;
  return NextResponse.json(
    { covers, complete },
    {
      headers: {
        // Empty answers are usually upstream failures and must be retried.
        "Cache-Control":
          covers.length > 0
            ? `public, max-age=${maxAge}, stale-while-revalidate=${complete ? 86400 : 300}`
            : "no-store",
      },
    },
  );
}

export async function GET(request: NextRequest) {
  const cached = cacheHolder.__hermesDiscoverCacheV2;
  if (cached) {
    const age = Date.now() - cached.at;
    if (cached.covers.length === 0) {
      // A short failure cooldown keeps Home from retrying eight lookups on
      // every visit while Spotify is rate limiting or unavailable. It is not
      // a success cache: recovery is picked up after the cooldown.
      if (age < FAILURE_COOLDOWN_MS) return response([], false);
    } else {
      const ttl = cached.complete ? COMPLETE_CACHE_MS : PARTIAL_CACHE_MS;
      if (age < ttl) return response(cached.covers, cached.complete);
    }
  }

  const { api, access } = await getRequestSpotifyApi(request);
  if (!api) return response([], false);

  const result = await buildCuratedDiscover(api);
  cacheHolder.__hermesDiscoverCacheV2 = {
    at: Date.now(),
    covers: result.covers,
    complete: result.complete,
  };
  if (!result.complete) {
    const codes = [...new Set(result.failures.map((failure) => failure.code))];
    console.warn(
      `[spotify] discover resolved ${result.covers.length}/${DISCOVERY_ARTISTS.length} curated albums; missing: ${result.missing.join(", ") || "unknown"}${codes.length > 0 ? `; provider: ${codes.join(", ")}` : ""}`,
    );
  }
  return attachRefreshedTokens(
    response(result.covers, result.complete),
    access,
    request,
  );
}
