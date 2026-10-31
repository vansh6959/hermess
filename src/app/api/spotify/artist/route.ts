import { NextResponse, type NextRequest } from "next/server";
import { SpotifyApiError } from "@/lib/spotify/server";
import {
  attachRefreshedTokens,
  getRequestSpotifyApi,
} from "@/lib/spotify/user-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SPOTIFY_ID = /^[A-Za-z0-9_-]{1,128}$/;

function failure(message: string, status: number) {
  return NextResponse.json(
    { error: { code: "unavailable", message } },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

export async function GET(request: NextRequest) {
  const artistId = request.nextUrl.searchParams.get("id")?.trim() ?? "";
  if (!artistId || !SPOTIFY_ID.test(artistId)) {
    return failure("A valid artist is required.", 400);
  }

  const { api, access } = await getRequestSpotifyApi(request);
  if (!api) {
    return failure(
      "Playback is not configured on the server. Add the music service credentials to .env.local and restart.",
      503,
    );
  }

  try {
    const tracks = await api.artistTopTracks(artistId);
    return attachRefreshedTokens(
      NextResponse.json(
        { tracks },
        { headers: { "Cache-Control": "private, max-age=600" } },
      ),
      access,
      request,
    );
  } catch (error) {
    if (error instanceof SpotifyApiError) {
      console.warn(
        `[spotify] artist lookup failed: ${error.code} (${error.status ?? "no status"})`,
      );
      return attachRefreshedTokens(
        failure(error.message, error.code === "rate_limited" ? 429 : 502),
        access,
        request,
      );
    }
    console.error("[spotify] unexpected artist lookup failure");
    return attachRefreshedTokens(
      failure("Artist tracks could not be loaded.", 500),
      access,
      request,
    );
  }
}
