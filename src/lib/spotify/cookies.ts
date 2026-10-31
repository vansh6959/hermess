import "server-only";
import type { NextRequest, NextResponse } from "next/server";
import type { SpotifyProfileSummary, SpotifySession } from "./playback-types";
import type { SpotifyTokenSet } from "./oauth";

const ACCESS_COOKIE = "hermes_spotify_access";
const REFRESH_COOKIE = "hermes_spotify_refresh";
const EXPIRES_COOKIE = "hermes_spotify_expires";
const PROFILE_COOKIE = "hermes_spotify_profile";
const SCOPE_COOKIE = "hermes_spotify_scope";
const OAUTH_COOKIE_PREFIX = "hermes_spotify_oauth_";

const REFRESH_MAX_AGE = 60 * 60 * 24 * 30;
const OAUTH_MAX_AGE = 60 * 30;

function oauthCookieName(state: string): string {
  return `${OAUTH_COOKIE_PREFIX}${state}`;
}

function encodeJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function decodeJson<T>(raw: string): T | null {
  try {
    return JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as T;
  } catch {
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }
}

function cookieOptions(maxAge: number, secure: boolean) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure,
    path: "/",
    maxAge,
  };
}

export function isSecureRequest(request: NextRequest): boolean {
  const forwarded = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const protocol = forwarded || request.nextUrl.protocol.replace(":", "");
  return protocol === "https";
}

export interface StoredOAuthState {
  state: string;
  redirectUri: string;
  returnTo: string;
  returnOrigin?: string;
}

export interface StoredSpotifyAuth {
  accessToken: string | null;
  refreshToken: string | null;
  expiresAt: number | null;
  profile: SpotifyProfileSummary | null;
  scopes: string[];
}

export function setOAuthStateCookie(
  response: NextResponse,
  value: StoredOAuthState,
  secure: boolean,
): void {
  response.cookies.set(
    oauthCookieName(value.state),
    encodeJson(value),
    cookieOptions(OAUTH_MAX_AGE, secure),
  );
}

export function readOAuthStateCookie(
  request: NextRequest,
  state: string | null,
): StoredOAuthState | null {
  if (!state) return null;
  const raw = request.cookies.get(oauthCookieName(state))?.value;
  if (!raw) return null;
  const parsed = decodeJson<Partial<StoredOAuthState>>(raw);
  if (
    !parsed ||
    typeof parsed.state !== "string" ||
    typeof parsed.redirectUri !== "string" ||
    typeof parsed.returnTo !== "string"
  ) {
    return null;
  }
  return {
    state: parsed.state,
    redirectUri: parsed.redirectUri,
    returnTo: parsed.returnTo,
    ...(typeof parsed.returnOrigin === "string"
      ? { returnOrigin: parsed.returnOrigin }
      : {}),
  };
}

export function clearOAuthStateCookie(
  response: NextResponse,
  state: string | null,
  secure: boolean,
): void {
  if (!state) return;
  response.cookies.set(
    oauthCookieName(state),
    "",
    cookieOptions(0, secure),
  );
}

export function setAuthCookies(
  response: NextResponse,
  tokens: SpotifyTokenSet,
  profile: SpotifyProfileSummary,
  secure: boolean,
): void {
  const expiresAt = Date.now() + tokens.expiresIn * 1000;
  response.cookies.set(ACCESS_COOKIE, tokens.accessToken, {
    ...cookieOptions(tokens.expiresIn, secure),
  });
  if (tokens.refreshToken) {
    response.cookies.set(REFRESH_COOKIE, tokens.refreshToken, {
      ...cookieOptions(REFRESH_MAX_AGE, secure),
    });
  }
  response.cookies.set(EXPIRES_COOKIE, String(expiresAt), {
    ...cookieOptions(REFRESH_MAX_AGE, secure),
  });
  response.cookies.set(PROFILE_COOKIE, encodeJson(profile), {
    ...cookieOptions(REFRESH_MAX_AGE, secure),
  });
  if (tokens.scope) {
    response.cookies.set(SCOPE_COOKIE, tokens.scope, {
      ...cookieOptions(REFRESH_MAX_AGE, secure),
    });
  }
}

export function setRefreshedTokens(
  response: NextResponse,
  tokens: SpotifyTokenSet,
  secure: boolean,
): void {
  const expiresAt = Date.now() + tokens.expiresIn * 1000;
  response.cookies.set(ACCESS_COOKIE, tokens.accessToken, {
    ...cookieOptions(tokens.expiresIn, secure),
  });
  if (tokens.refreshToken) {
    response.cookies.set(REFRESH_COOKIE, tokens.refreshToken, {
      ...cookieOptions(REFRESH_MAX_AGE, secure),
    });
  }
  response.cookies.set(EXPIRES_COOKIE, String(expiresAt), {
    ...cookieOptions(REFRESH_MAX_AGE, secure),
  });
  if (tokens.scope) {
    response.cookies.set(SCOPE_COOKIE, tokens.scope, {
      ...cookieOptions(REFRESH_MAX_AGE, secure),
    });
  }
}

export function clearAuthCookies(
  response: NextResponse,
  secure: boolean,
): void {
  for (const name of [
    ACCESS_COOKIE,
    REFRESH_COOKIE,
    EXPIRES_COOKIE,
    PROFILE_COOKIE,
    SCOPE_COOKIE,
  ]) {
    response.cookies.set(name, "", cookieOptions(0, secure));
  }
}

export function readSpotifyAuth(request: NextRequest): StoredSpotifyAuth {
  const accessToken = request.cookies.get(ACCESS_COOKIE)?.value ?? null;
  const refreshToken = request.cookies.get(REFRESH_COOKIE)?.value ?? null;
  const expiresRaw = request.cookies.get(EXPIRES_COOKIE)?.value;
  const expiresAt = expiresRaw ? Number(expiresRaw) : null;
  const scopes = (request.cookies.get(SCOPE_COOKIE)?.value ?? "")
    .split(/\s+/)
    .filter(Boolean);

  let profile: SpotifyProfileSummary | null = null;
  const profileRaw = request.cookies.get(PROFILE_COOKIE)?.value;
  if (profileRaw) {
    const parsed = decodeJson<Partial<SpotifyProfileSummary>>(profileRaw);
    if (
      parsed &&
      typeof parsed.id === "string" &&
      typeof parsed.displayName === "string" &&
      typeof parsed.premium === "boolean" &&
      (parsed.product === "premium" || parsed.product === "free")
    ) {
      profile = {
        id: parsed.id,
        displayName: parsed.displayName,
        imageUrl: typeof parsed.imageUrl === "string" ? parsed.imageUrl : null,
        product: parsed.product,
        premium: parsed.premium,
      };
    }
  }

  return {
    accessToken,
    refreshToken,
    expiresAt: Number.isFinite(expiresAt) ? expiresAt : null,
    profile,
    scopes,
  };
}

export function buildSpotifySession(
  configured: boolean,
  auth: StoredSpotifyAuth,
): SpotifySession {
  return {
    configured,
    connected: Boolean(configured && auth.profile && (auth.accessToken || auth.refreshToken)),
    profile: auth.profile,
    scopes: auth.scopes,
    canModifyPlaylists:
      auth.scopes.includes("playlist-modify-private") ||
      auth.scopes.includes("playlist-modify-public"),
  };
}
