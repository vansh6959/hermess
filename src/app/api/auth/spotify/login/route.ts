import { NextResponse, type NextRequest } from "next/server";
import {
  buildAuthorizeUrl,
  resolveRedirectUri,
  sanitizeReturnOrigin,
  sanitizeReturnTo,
} from "@/lib/spotify/oauth";
import { readSpotifyConfig } from "@/lib/spotify/server";
import { isSecureRequest, setOAuthStateCookie } from "@/lib/spotify/cookies";
import { requestOrigin } from "@/lib/spotify/request-origin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function redirect(url: URL | string) {
  const response = NextResponse.redirect(url);
  // OAuth URLs contain a one-time state and must never be replayed from cache.
  response.headers.set("Cache-Control", "no-store, max-age=0");
  return response;
}

function back(origin: string, returnTo: string, status: string) {
  const url = new URL(returnTo, origin);
  url.searchParams.set("spotify", status);
  return redirect(url);
}

export async function GET(request: NextRequest) {
  const configured = readSpotifyConfig();
  const returnTo = sanitizeReturnTo(request.nextUrl.searchParams.get("returnTo"));
  const origin = requestOrigin(request);

  if (!configured) return back(origin, returnTo, "not_configured");

  const redirectUri = resolveRedirectUri(origin);
  const redirectOrigin = new URL(redirectUri).origin;

  // The OAuth state cookie must live on the origin Spotify redirects back to.
  // This differs for a localhost -> 127.0.0.1 swap or a drifted dev port.
  if (redirectOrigin !== origin) {
    const canonical = new URL("/api/auth/spotify/login", redirectOrigin);
    canonical.searchParams.set("returnTo", returnTo);
    const returnOrigin = sanitizeReturnOrigin(origin, redirectUri);
    if (returnOrigin) canonical.searchParams.set("returnOrigin", returnOrigin);
    return redirect(canonical);
  }

  const returnOrigin = sanitizeReturnOrigin(
    request.nextUrl.searchParams.get("returnOrigin"),
    redirectUri,
  );
  const state = crypto.randomUUID();
  const authorizeUrl = buildAuthorizeUrl({
    clientId: configured.clientId,
    redirectUri,
    state,
  });

  const response = redirect(authorizeUrl);
  setOAuthStateCookie(
    response,
    {
      state,
      redirectUri,
      returnTo,
      ...(returnOrigin ? { returnOrigin } : {}),
    },
    isSecureRequest(request),
  );
  return response;
}
