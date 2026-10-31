import "server-only";
import { z } from "zod";
import type { SpotifyConfig } from "./server";
import type { SpotifyProfileSummary } from "./playback-types";

export const SPOTIFY_SCOPES = [
  "streaming",
  "user-read-email",
  "user-read-private",
  "user-read-playback-state",
  "user-modify-playback-state",
  "user-read-currently-playing",
  "playlist-read-private",
  "playlist-read-collaborative",
  "playlist-modify-private",
  "playlist-modify-public",
  "user-library-read",
].join(" ");

const TOKEN_URL = "https://accounts.spotify.com/api/token";
const API_BASE = "https://api.spotify.com/v1";
const TIMEOUT_MS = 10_000;
const RETRY_ATTEMPTS = 2;
const RETRY_DELAY_MS = 250;
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithRetry(
  url: string,
  init: Omit<RequestInit, "signal">,
): Promise<Response> {
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= RETRY_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(url, {
        ...init,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (attempt < RETRY_ATTEMPTS && RETRYABLE_STATUS.has(response.status)) {
        await response.body?.cancel().catch(() => undefined);
        await wait(RETRY_DELAY_MS * attempt);
        continue;
      }
      return response;
    } catch (error) {
      lastError = error;
      if (attempt >= RETRY_ATTEMPTS) break;
      await wait(RETRY_DELAY_MS * attempt);
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Could not reach the music service.");
}

const tokenSchema = z
  .object({
    access_token: z.string().min(1),
    refresh_token: z.string().min(1).optional(),
    expires_in: z.number().positive(),
    scope: z.string().optional(),
    token_type: z.string().optional(),
  })
  .passthrough();

const profileSchema = z
  .object({
    id: z.string(),
    display_name: z.string().nullish(),
    product: z.string().nullish(),
    images: z
      .array(
        z
          .object({
            url: z.string().url(),
            width: z.number().nullish(),
          })
          .passthrough(),
      )
      .nullish(),
  })
  .passthrough();

export interface SpotifyTokenSet {
  accessToken: string;
  refreshToken?: string;
  expiresIn: number;
  scope?: string;
}

export class SpotifyOAuthError extends Error {
  readonly code: "auth_failed" | "unavailable" | "invalid_response";

  constructor(code: SpotifyOAuthError["code"], message: string) {
    super(message);
    this.name = "SpotifyOAuthError";
    this.code = code;
  }
}

function basicAuth(config: SpotifyConfig): string {
  return Buffer.from(`${config.clientId}:${config.clientSecret}`).toString(
    "base64",
  );
}

async function requestToken(
  config: SpotifyConfig,
  body: URLSearchParams,
): Promise<SpotifyTokenSet> {
  let response: Response;
  try {
    response = await fetchWithRetry(TOKEN_URL, {
      method: "POST",
      headers: {
        Authorization: `Basic ${basicAuth(config)}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
      cache: "no-store",
    });
  } catch {
    throw new SpotifyOAuthError(
      "unavailable",
      "Could not reach the music service. Try again.",
    );
  }

  if (!response.ok) {
    throw new SpotifyOAuthError(
      "auth_failed",
      "The music service rejected the authentication request.",
    );
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new SpotifyOAuthError(
      "invalid_response",
      "The music service returned an unreadable authentication response.",
    );
  }

  const parsed = tokenSchema.safeParse(payload);
  if (!parsed.success) {
    throw new SpotifyOAuthError(
      "invalid_response",
      "The music service returned an unexpected authentication response.",
    );
  }

  return {
    accessToken: parsed.data.access_token,
    ...(parsed.data.refresh_token
      ? { refreshToken: parsed.data.refresh_token }
      : {}),
    expiresIn: Math.max(30, parsed.data.expires_in),
    ...(parsed.data.scope ? { scope: parsed.data.scope } : {}),
  };
}

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

function isLoopbackUrl(url: URL): boolean {
  return url.protocol === "http:" && LOOPBACK_HOSTS.has(url.hostname);
}

export function resolveRedirectUri(origin: string): string {
  const configured = process.env.SPOTIFY_REDIRECT_URI?.trim();
  if (configured) {
    try {
      const requestOrigin = new URL(origin);
      const configuredUrl = new URL(configured);
      if (configuredUrl.origin === requestOrigin.origin) {
        return configured;
      }
      // A dev server can land on another port when the default is taken. The
      // configured URL is the one registered with the provider, so authorize
      // against it instead of inventing a callback the provider will reject.
      if (isLoopbackUrl(requestOrigin) && isLoopbackUrl(configuredUrl)) {
        return configured;
      }
    } catch {
      // Ignore malformed env values and fall back to the current origin.
    }
  }
  return `${origin}/api/auth/spotify/callback`;
}

export function buildAuthorizeUrl({
  clientId,
  redirectUri,
  state,
}: {
  clientId: string;
  redirectUri: string;
  state: string;
}): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri,
    state,
    scope: SPOTIFY_SCOPES,
  });
  return `https://accounts.spotify.com/authorize?${params.toString()}`;
}

export function sanitizeReturnTo(value: string | null): string {
  if (!value) return "/search";
  return /^\/(search|settings|library|stats)?$/.test(value)
    ? value
    : "/search";
}

// Cookies ignore ports but not hosts, so a callback can safely return the
// browser to another loopback port on the same host after authorization.
export function sanitizeReturnOrigin(
  value: string | null | undefined,
  redirectOrigin: string,
): string | null {
  if (!value) return null;
  try {
    const candidate = new URL(value);
    const target = new URL(redirectOrigin);
    if (candidate.pathname !== "/" || candidate.search || candidate.hash) {
      return null;
    }
    if (!isLoopbackUrl(candidate) || !isLoopbackUrl(target)) return null;
    if (candidate.hostname !== target.hostname) return null;
    return candidate.origin;
  } catch {
    return null;
  }
}

export async function exchangeAuthorizationCode(
  config: SpotifyConfig,
  code: string,
  redirectUri: string,
): Promise<SpotifyTokenSet> {
  return requestToken(
    config,
    new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
    }),
  );
}

export async function refreshUserAccessToken(
  config: SpotifyConfig,
  refreshToken: string,
): Promise<SpotifyTokenSet> {
  return requestToken(
    config,
    new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  );
}

export async function fetchSpotifyProfile(
  accessToken: string,
): Promise<SpotifyProfileSummary> {
  let response: Response;
  try {
    response = await fetchWithRetry(`${API_BASE}/me`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
      cache: "no-store",
    });
  } catch {
    throw new SpotifyOAuthError("unavailable", "Could not reach the music service.");
  }

  if (!response.ok) {
    throw new SpotifyOAuthError(
      "auth_failed",
      "The music service rejected the user session.",
    );
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new SpotifyOAuthError(
      "invalid_response",
      "The music service returned an unreadable profile.",
    );
  }

  const parsed = profileSchema.safeParse(payload);
  if (!parsed.success) {
    throw new SpotifyOAuthError(
      "invalid_response",
      "The music service returned an unexpected profile.",
    );
  }

  const images = [...(parsed.data.images ?? [])].sort(
    (a, b) => (b.width ?? 0) - (a.width ?? 0),
  );

  return {
    id: parsed.data.id,
    displayName: parsed.data.display_name ?? "Listener",
    imageUrl: images[0]?.url ?? null,
    product: parsed.data.product === "premium" ? "premium" : "free",
    premium: parsed.data.product === "premium",
  };
}
