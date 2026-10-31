import { NextResponse, type NextRequest } from "next/server";
import { readSpotifyConfig } from "@/lib/spotify/server";
import { buildSpotifySession, readSpotifyAuth } from "@/lib/spotify/cookies";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: NextRequest) {
  const configured = Boolean(readSpotifyConfig());
  const auth = readSpotifyAuth(request);
  return NextResponse.json(buildSpotifySession(configured, auth), {
    headers: { "Cache-Control": "no-store" },
  });
}
