import { NextResponse, type NextRequest } from "next/server";
import { readSpotifyConfig } from "@/lib/spotify/server";
import { refreshUserAccessToken } from "@/lib/spotify/oauth";
import {
  clearAuthCookies,
  isSecureRequest,
  readSpotifyAuth,
  setRefreshedTokens,
} from "@/lib/spotify/cookies";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function reconnectRequired(secure: boolean) {
  const response = NextResponse.json(
    {
      error: {
        code: "reconnect_required",
        message: "Your session expired. Reconnect your account.",
      },
    },
    {
      status: 401,
      headers: { "Cache-Control": "no-store" },
    },
  );
  clearAuthCookies(response, secure);
  return response;
}

export async function GET(request: NextRequest) {
  const configured = readSpotifyConfig();
  if (!configured) {
    return NextResponse.json(
      {
        error: {
          code: "not_configured",
          message: "Playback is not configured on the server.",
        },
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  const auth = readSpotifyAuth(request);
  const now = Date.now();
  const forceRefresh = request.nextUrl.searchParams.get("refresh") === "1";

  if (
    !forceRefresh &&
    auth.accessToken &&
    auth.expiresAt &&
    auth.expiresAt > now + 30_000
  ) {
    return NextResponse.json(
      { accessToken: auth.accessToken, expiresAt: auth.expiresAt },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  if (!auth.refreshToken) return reconnectRequired(isSecureRequest(request));

  try {
    const tokens = await refreshUserAccessToken(configured, auth.refreshToken);
    const expiresAt = Date.now() + tokens.expiresIn * 1000;
    const response = NextResponse.json(
      { accessToken: tokens.accessToken, expiresAt },
      { headers: { "Cache-Control": "no-store" } },
    );
    setRefreshedTokens(response, tokens, isSecureRequest(request));
    return response;
  } catch {
    return reconnectRequired(isSecureRequest(request));
  }
}
