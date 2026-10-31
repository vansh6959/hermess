import "server-only";
import type { NextRequest } from "next/server";

// In development Next.js reports `localhost` for IP hosts via nextUrl.origin,
// which would break OAuth cookies and loopback redirect matching.
export function requestOrigin(request: NextRequest): string {
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (!host) return request.nextUrl.origin;

  const forwardedProto = request.headers.get("x-forwarded-proto");
  const protocol = forwardedProto ?? request.nextUrl.protocol.replace(":", "");
  return `${protocol}://${host}`;
}
