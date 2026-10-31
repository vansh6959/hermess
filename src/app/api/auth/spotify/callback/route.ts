import { NextResponse, type NextRequest } from "next/server";
import {
  exchangeAuthorizationCode,
  fetchSpotifyProfile,
  sanitizeReturnOrigin,
  sanitizeReturnTo,
} from "@/lib/spotify/oauth";
import { readSpotifyConfig } from "@/lib/spotify/server";
import {
  clearOAuthStateCookie,
  isSecureRequest,
  readOAuthStateCookie,
  setAuthCookies,
} from "@/lib/spotify/cookies";
import { requestOrigin } from "@/lib/spotify/request-origin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function redirectWithStatus(
  origin: string,
  returnTo: string,
  status: string,
): NextResponse {
  const url = new URL(returnTo, origin);
  url.searchParams.set("spotify", status);
  const response = NextResponse.redirect(url);
  response.headers.set("Cache-Control", "no-store, max-age=0");
  return response;
}

export async function GET(request: NextRequest) {
  const origin = requestOrigin(request);
  const secure = isSecureRequest(request);
  const state = request.nextUrl.searchParams.get("state");
  const code = request.nextUrl.searchParams.get("code");
  const oauthError = request.nextUrl.searchParams.get("error");
  const oauth = readOAuthStateCookie(request, state);
  const returnTo = oauth ? sanitizeReturnTo(oauth.returnTo) : "/search";
  const returnOrigin =
    (oauth ? sanitizeReturnOrigin(oauth.returnOrigin, origin) : null) ?? origin;
  const clearOAuth = (response: NextResponse) =>
    clearOAuthStateCookie(response, state, secure);

  if (!oauth || !state || state !== oauth.state) {
    const response = redirectWithStatus(returnOrigin, "/search", "state_error");
    clearOAuth(response);
    return response;
  }

  if (oauthError) {
    const response = redirectWithStatus(returnOrigin, returnTo, "denied");
    clearOAuth(response);
    return response;
  }

  if (!code) {
    const response = redirectWithStatus(returnOrigin, returnTo, "missing_code");
    clearOAuth(response);
    return response;
  }

  const configured = readSpotifyConfig();
  if (!configured) {
    const response = redirectWithStatus(returnOrigin, returnTo, "not_configured");
    clearOAuth(response);
    return response;
  }

  try {
    const tokens = await exchangeAuthorizationCode(
      configured,
      code,
      oauth.redirectUri,
    );
    const profile = await fetchSpotifyProfile(tokens.accessToken);
    const response = redirectWithStatus(
      returnOrigin,
      returnTo,
      profile.premium ? "connected" : "free",
    );
    setAuthCookies(response, tokens, profile, secure);
    clearOAuth(response);
    return response;
  } catch (error) {
    console.warn(
      "[spotify] OAuth callback failed:",
      error instanceof Error ? error.name : "unknown",
    );
    const response = redirectWithStatus(returnOrigin, returnTo, "auth_failed");
    clearOAuth(response);
    return response;
  }
}
