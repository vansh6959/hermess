import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { SpotifyApiError } from "@/lib/spotify/server";
import {
  attachRefreshedTokens,
  getRequestSpotifyApi,
} from "@/lib/spotify/user-api";
import { readSpotifyAuth } from "@/lib/spotify/cookies";
import {
  addTrackToPlaylist,
  createPlaylist,
  listManageablePlaylists,
} from "@/lib/spotify/playlists";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TRACK_ID = /^[A-Za-z0-9]{1,64}$/;
const PLAYLIST_ID = /^[A-Za-z0-9]{1,128}$/;

const addSchema = z.object({
  action: z.literal("add"),
  playlistId: z.string().regex(PLAYLIST_ID),
  trackId: z.string().regex(TRACK_ID),
});

const createSchema = z.object({
  action: z.literal("create").optional(),
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().max(300).optional(),
  isPublic: z.boolean().optional(),
  trackId: z.string().regex(TRACK_ID).optional(),
  playlistId: z.undefined().optional(),
});

const bodySchema = z.union([addSchema, createSchema]);

function needsConnect() {
  return NextResponse.json(
    {
      error: {
        code: "needs_connect",
        message: "Connect Spotify to manage playlists.",
      },
      needsConnect: true,
    },
    { status: 401, headers: { "Cache-Control": "no-store" } },
  );
}

function failure(
  error: unknown,
  access: Awaited<ReturnType<typeof getRequestSpotifyApi>>["access"],
  request: NextRequest,
) {
  if (error instanceof SpotifyApiError) {
    const isConnect =
      error.status === 401 || error.code === "unauthorized";
    const isScope = error.status === 403 || error.code === "forbidden";
    const status = isConnect
      ? 401
      : isScope
        ? 403
        : error.code === "rate_limited"
          ? 429
          : error.status === 404
            ? 404
            : 502;
    const response = NextResponse.json(
      {
        error: {
          code: isConnect ? "needs_connect" : isScope ? "needs_scope" : error.code,
          message: error.message,
          ...(error.retryAfter ? { retryAfter: error.retryAfter } : {}),
        },
        ...(isConnect ? { needsConnect: true } : {}),
        ...(isScope ? { needsScope: true } : {}),
      },
      {
        status,
        headers: {
          "Cache-Control": "no-store",
          ...(error.retryAfter
            ? { "Retry-After": String(error.retryAfter) }
            : {}),
        },
      },
    );
    return attachRefreshedTokens(response, access, request);
  }
  return attachRefreshedTokens(
    NextResponse.json(
      {
        error: {
          code: "unavailable",
          message: "Spotify could not complete the playlist request.",
        },
      },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    ),
    access,
    request,
  );
}

export async function GET(request: NextRequest) {
  const { api, access } = await getRequestSpotifyApi(request);
  if (!api || !access) return needsConnect();

  const profile = readSpotifyAuth(request).profile;
  if (!profile?.id) return needsConnect();

  try {
    const playlists = await listManageablePlaylists(
      access.token,
      profile.id,
    );
    return attachRefreshedTokens(
      NextResponse.json(
        { playlists },
        { headers: { "Cache-Control": "no-store" } },
      ),
      access,
      request,
    );
  } catch (error) {
    return failure(error, access, request);
  }
}

export async function POST(request: NextRequest) {
  const { api, access } = await getRequestSpotifyApi(request);
  if (!api || !access) return needsConnect();

  const profile = readSpotifyAuth(request).profile;
  if (!profile?.id) return needsConnect();

  const parsed = bodySchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          code: "invalid_request",
          message: "A playlist name and valid track are required.",
        },
      },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    if (parsed.data.action === "add") {
      await addTrackToPlaylist(
        access.token,
        parsed.data.playlistId,
        parsed.data.trackId,
      );
      return attachRefreshedTokens(
        NextResponse.json(
          { added: true, playlistId: parsed.data.playlistId },
          { headers: { "Cache-Control": "no-store" } },
        ),
        access,
        request,
      );
    }

    const playlist = await createPlaylist(access.token, profile.id, {
      name: parsed.data.name,
      description: parsed.data.description,
      isPublic: Boolean(parsed.data.isPublic),
    });

    if (!parsed.data.trackId) {
      return attachRefreshedTokens(
        NextResponse.json(
          { playlist, added: false },
          { headers: { "Cache-Control": "no-store" } },
        ),
        access,
        request,
      );
    }

    try {
      await addTrackToPlaylist(
        access.token,
        playlist.id,
        parsed.data.trackId,
      );
      return attachRefreshedTokens(
        NextResponse.json(
          { playlist, added: true },
          { headers: { "Cache-Control": "no-store" } },
        ),
        access,
        request,
      );
    } catch (error) {
      // The playlist exists even if adding the track failed. Report both
      // facts instead of pretending the whole operation succeeded.
      const message =
        error instanceof SpotifyApiError
          ? error.message
          : "The playlist was created, but the track was not added.";
      return attachRefreshedTokens(
        NextResponse.json(
          {
            playlist,
            added: false,
            error: {
              code:
                error instanceof SpotifyApiError ? error.code : "unavailable",
              message,
              ...(error instanceof SpotifyApiError && error.retryAfter
                ? { retryAfter: error.retryAfter }
                : {}),
            },
          },
          { headers: { "Cache-Control": "no-store" } },
        ),
        access,
        request,
      );
    }
  } catch (error) {
    return failure(error, access, request);
  }
}
