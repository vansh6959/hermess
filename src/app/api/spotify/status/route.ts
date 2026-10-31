import { NextResponse } from "next/server";
import { readSpotifyConfig } from "@/lib/spotify/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(
    {
      provider: "spotify",
      configured: readSpotifyConfig() !== null,
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
