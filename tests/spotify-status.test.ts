import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/spotify/status/route";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("Spotify status route", () => {
  it("reports when credentials are missing", async () => {
    vi.stubEnv("SPOTIFY_CLIENT_ID", "");
    vi.stubEnv("SPOTIFY_CLIENT_SECRET", "");
    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({
      provider: "spotify",
      configured: false,
    });
  });

  it("reports configured without exposing credentials", async () => {
    vi.stubEnv("SPOTIFY_CLIENT_ID", "server-side-client-id");
    vi.stubEnv("SPOTIFY_CLIENT_SECRET", "server-side-client-secret");
    const response = await GET();
    const body = await response.json();
    expect(body).toEqual({ provider: "spotify", configured: true });
    expect(JSON.stringify(body)).not.toContain("server-side-client-secret");
    expect(JSON.stringify(body)).not.toContain("server-side-client-id");
  });
});
