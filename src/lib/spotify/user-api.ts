import "server-only";
import type { NextRequest, NextResponse } from "next/server";
import {
  createUserSpotifyApi,
  getSpotifyApi,
  readSpotifyConfig,
  type SpotifyApi,
} from "./server";
import { readUserAccess, type UserAccess } from "./user-token";
import { isSecureRequest, setRefreshedTokens } from "./cookies";

export interface RequestSpotifyApi {
  api: SpotifyApi | null;
  access: UserAccess | null;
}

export async function getRequestSpotifyApi(
  request: NextRequest,
): Promise<RequestSpotifyApi> {
  const config = readSpotifyConfig();
  if (!config) return { api: null, access: null };

  const access = await readUserAccess(request, config);
  if (access) {
    return { api: createUserSpotifyApi(config, access.token), access };
  }
  return { api: getSpotifyApi(), access: null };
}

export function attachRefreshedTokens<T>(
  response: NextResponse<T>,
  access: UserAccess | null,
  request: NextRequest,
): NextResponse<T> {
  if (access?.refreshed) {
    setRefreshedTokens(response, access.refreshed, isSecureRequest(request));
  }
  return response;
}
