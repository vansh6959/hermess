import { NextResponse, type NextRequest } from "next/server";
import { readSpotifyConfig } from "@/lib/spotify/server";
import { readUserAccess } from "@/lib/spotify/user-token";
import {
  isSecureRequest,
  readSpotifyAuth,
  setRefreshedTokens,
} from "@/lib/spotify/cookies";
import { emptyListeningStats } from "@/lib/spotify/stats";
import {
  isValidBrowserId,
  isValidStatsUserId,
  readAccountListeningStats,
  upsertBrowserListeningStats,
} from "@/lib/spotify/stats-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 4_000_000;

function response(
  request: NextRequest,
  payload: { connected: boolean; stats: unknown },
  refreshed: NonNullable<
    Awaited<ReturnType<typeof readUserAccess>>
  >["refreshed"] | null,
  status = 200,
) {
  const result = NextResponse.json(payload, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
  if (refreshed) {
    setRefreshedTokens(result, refreshed, isSecureRequest(request));
  }
  return result;
}

async function authorize(request: NextRequest) {
  const config = readSpotifyConfig();
  if (!config) return null;
  const access = await readUserAccess(request, config);
  if (!access) return null;
  const auth = readSpotifyAuth(request);
  const userId = auth.profile?.id;
  if (!isValidStatsUserId(userId)) return null;
  return { userId, refreshed: access.refreshed };
}

function disconnected(request: NextRequest) {
  return response(
    request,
    { connected: false, stats: emptyListeningStats() },
    null,
  );
}

export async function GET(request: NextRequest) {
  const access = await authorize(request);
  if (!access) return disconnected(request);
  try {
    const stats = await readAccountListeningStats(access.userId);
    return response(
      request,
      { connected: true, stats },
      access.refreshed,
    );
  } catch {
    return response(
      request,
      { connected: false, stats: emptyListeningStats() },
      access.refreshed,
      500,
    );
  }
}

export async function PUT(request: NextRequest) {
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    return response(
      request,
      { connected: false, stats: emptyListeningStats() },
      null,
      413,
    );
  }

  const body = (await request.json().catch(() => null)) as {
    browserId?: unknown;
    stats?: unknown;
  } | null;
  if (!body || !isValidBrowserId(body.browserId)) {
    return response(
      request,
      { connected: false, stats: emptyListeningStats() },
      null,
      400,
    );
  }

  const access = await authorize(request);
  if (!access) return disconnected(request);

  try {
    const stats = await upsertBrowserListeningStats(
      access.userId,
      body.browserId,
      body.stats,
    );
    return response(request, { connected: true, stats }, access.refreshed);
  } catch {
    return response(
      request,
      { connected: false, stats: emptyListeningStats() },
      access.refreshed,
      500,
    );
  }
}
