import "server-only";
import type { NextRequest } from "next/server";
import { readSpotifyAuth } from "./cookies";
import { refreshUserAccessToken, type SpotifyTokenSet } from "./oauth";
import type { SpotifyConfig } from "./server";

export interface UserAccess {
  token: string;
  refreshed: SpotifyTokenSet | null;
}

export async function readUserAccess(
  request: NextRequest,
  config: SpotifyConfig,
): Promise<UserAccess | null> {
  const auth = readSpotifyAuth(request);
  if (
    auth.accessToken &&
    auth.expiresAt &&
    auth.expiresAt > Date.now() + 30_000
  ) {
    return { token: auth.accessToken, refreshed: null };
  }
  if (!auth.refreshToken) return null;

  try {
    const refreshed = await refreshUserAccessToken(config, auth.refreshToken);
    return { token: refreshed.accessToken, refreshed };
  } catch {
    return null;
  }
}
