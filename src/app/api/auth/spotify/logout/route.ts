import { NextResponse, type NextRequest } from "next/server";
import { clearAuthCookies, isSecureRequest } from "@/lib/spotify/cookies";
import { requestOrigin } from "@/lib/spotify/request-origin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (origin) {
    try {
      if (new URL(origin).origin !== requestOrigin(request)) {
        return NextResponse.json({ error: "Invalid origin." }, { status: 403 });
      }
    } catch {
      return NextResponse.json({ error: "Invalid origin." }, { status: 403 });
    }
  }

  const response = NextResponse.json(
    { ok: true },
    { headers: { "Cache-Control": "no-store" } },
  );
  clearAuthCookies(response, isSecureRequest(request));
  return response;
}
