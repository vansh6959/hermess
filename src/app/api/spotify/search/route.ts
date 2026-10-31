import { NextResponse, type NextRequest } from "next/server";
import { SpotifyApiError, getSpotifyApi } from "@/lib/spotify/server";
import {
  attachRefreshedTokens,
  getRequestSpotifyApi,
} from "@/lib/spotify/user-api";
import type {
  SpotifyApiErrorBody,
  SpotifyErrorResponse,
  SpotifySearchPayload,
} from "@/lib/spotify/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_QUERY_LENGTH = 100;

function errorResponse(
  error: SpotifyApiErrorBody,
  status: number,
  extraHeaders?: Record<string, string>,
): NextResponse<SpotifyErrorResponse> {
  return NextResponse.json(
    { error },
    {
      status,
      headers: {
        "Cache-Control": "no-store",
        ...extraHeaders,
      },
    },
  );
}

function statusFor(error: SpotifyApiError): number {
  switch (error.code) {
    case "rate_limited":
      return 429;
    case "unauthorized":
    case "forbidden":
    case "unavailable":
    case "invalid_response":
    case "network":
      return 502;
    default:
      return 500;
  }
}

export async function GET(
  request: NextRequest,
): Promise<NextResponse<SpotifySearchPayload | SpotifyErrorResponse>> {
  const query = request.nextUrl.searchParams.get("q")?.trim() ?? "";

  if (query.length < 2) {
    return errorResponse(
      {
        code: "invalid_query",
        message: "Search for at least two characters.",
      },
      400,
    );
  }
  if (query.length > MAX_QUERY_LENGTH) {
    return errorResponse(
      {
        code: "invalid_query",
        message: "Search query is too long.",
      },
      400,
    );
  }

  const { api, access } = await getRequestSpotifyApi(request);
  if (!api) {
    return errorResponse(
      {
        code: "not_configured",
        message:
          "Playback is not configured on the server. Add the music service credentials to .env.local and restart.",
      },
      503,
    );
  }

  try {
    let data: Awaited<ReturnType<typeof api.search>>;
    try {
      data = await api.search(query);
    } catch (searchError) {
      // Search is public. If the user's token is throttled, the app's own
      // client-credentials token has a separate quota and can still serve it.
      if (
        !(searchError instanceof SpotifyApiError) ||
        searchError.code !== "rate_limited" ||
        !access
      ) {
        throw searchError;
      }
      const fallbackApi = getSpotifyApi();
      if (!fallbackApi) throw searchError;
      console.warn(
        "[spotify] user search rate-limited; retrying with client credentials",
      );
      try {
        data = await fallbackApi.search(query);
      } catch (fallbackError) {
        // Both tokens are limited: expose the shorter wait so Retry is useful.
        if (
          fallbackError instanceof SpotifyApiError &&
          fallbackError.code === "rate_limited" &&
          (fallbackError.retryAfter ?? Number.POSITIVE_INFINITY) <
            (searchError.retryAfter ?? Number.POSITIVE_INFINITY)
        ) {
          throw fallbackError;
        }
        throw searchError;
      }
    }
    const payload: SpotifySearchPayload = { provider: "spotify", ...data };
    const response = NextResponse.json(payload, {
      status: 200,
      headers: {
        "Cache-Control": "private, max-age=30",
      },
    });
    return attachRefreshedTokens(response, access, request);
  } catch (error) {
    if (error instanceof SpotifyApiError) {
      console.warn(
        `[spotify] search failed (${access ? "user" : "client"} token): ${error.code} (${error.status ?? "no status"})`,
      );
      return attachRefreshedTokens(
        errorResponse(
          error.toBody(),
          statusFor(error),
          error.retryAfter ? { "Retry-After": String(error.retryAfter) } : undefined,
        ),
        access,
        request,
      );
    }
    console.error("[spotify] unexpected search failure");
    return attachRefreshedTokens(
      errorResponse(
        {
          code: "unavailable",
          message: "Search failed unexpectedly.",
        },
        500,
      ),
      access,
      request,
    );
  }
}
