import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/lyrics/route";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function lrclibItem(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    trackName: "Test Song",
    artistName: "Test Artist",
    albumName: "Test Album",
    duration: 200,
    instrumental: false,
    plainLyrics: "first line\nsecond line",
    syncedLyrics: "[00:01.00] first line\n[00:03.00] second line",
    ...overrides,
  };
}

function requestUrl(query: string) {
  return new Request(`http://localhost/api/lyrics?${query}`);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("lyrics route", () => {
  it("retries with the primary artist when the billed artist has collaborators", async () => {
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = new URL(String(input));
        calls.push(url.toString());
        if (url.hostname === "lrclib.net") {
          const artist = url.searchParams.get("artist_name");
          if (artist === "Primary Artist") {
            return jsonResponse([
              lrclibItem({
                trackName: "Collaboration Song",
                artistName: "Primary Artist",
                albumName: "First Album",
                duration: 201,
              }),
            ]);
          }
          return jsonResponse([]);
        }
        return jsonResponse({ error: "not found" }, 404);
      }),
    );

    const response = await GET(
      requestUrl(
        "title=Collaboration%20Song&artist=Primary%20Artist%2C%20Guest%20Artist&album=First%20Album&duration=200",
      ),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.found).toBe(true);
    expect(payload.syncedLyrics).toContain("first line");
    expect(calls.some((url) => url.includes("artist_name=Primary+Artist"))).toBe(
      true,
    );
  });

  it("strips feature and remaster noise from the title", async () => {
    const titles: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = new URL(String(input));
        if (url.hostname === "lrclib.net") {
          const title = url.searchParams.get("track_name") ?? "";
          titles.push(title);
          if (title === "Clean Song") {
            return jsonResponse([
              lrclibItem({
                trackName: "Clean Song",
                artistName: "Solo Artist",
                syncedLyrics: "[00:01.00] clean line",
              }),
            ]);
          }
          return jsonResponse([]);
        }
        return jsonResponse({ error: "not found" }, 404);
      }),
    );

    const response = await GET(
      requestUrl(
        "title=Clean%20Song%20(feat.%20Someone)%20-%20Remastered%202011&artist=Solo%20Artist&duration=180",
      ),
    );
    const payload = await response.json();

    expect(payload.found).toBe(true);
    expect(payload.syncedLyrics).toContain("clean line");
    expect(titles).toContain("Clean Song");
  });

  it("prefers synced lyrics over an earlier plain match", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = new URL(String(input));
        if (url.hostname === "lrclib.net") {
          if (url.pathname === "/api/get") {
            return jsonResponse({ error: "not found" }, 404);
          }
          const artist = url.searchParams.get("artist_name");
          if (artist === "Primary Artist") {
            return jsonResponse([
              lrclibItem({
                trackName: "Timed Song",
                artistName: "Primary Artist",
                plainLyrics: "plain line",
                syncedLyrics: "[00:01.00] timed line",
              }),
            ]);
          }
          return jsonResponse([
            lrclibItem({
              trackName: "Timed Song",
              artistName: "Primary Artist, Guest Artist",
              plainLyrics: "plain line",
              syncedLyrics: null,
            }),
          ]);
        }
        return jsonResponse({ error: "not found" }, 404);
      }),
    );

    const response = await GET(
      requestUrl(
        "title=Timed%20Song&artist=Primary%20Artist%2C%20Guest%20Artist&album=Timed%20Album&duration=200",
      ),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.found).toBe(true);
    expect(payload.syncedLyrics).toContain("timed line");
  });

  it("uses a distinctive title to find the original's plain lyrics for a remix", async () => {
    const titleOnlyCalls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = new URL(String(input));
        if (url.hostname === "lrclib.net") {
          if (!url.searchParams.get("artist_name")) {
            titleOnlyCalls.push(url.toString());
            return jsonResponse([
              lrclibItem({
                trackName: "One of Your Girls",
                artistName: "Original Artist",
                albumName: "Original Album",
                duration: 182,
                plainLyrics: "original first line\noriginal second line",
                syncedLyrics: null,
              }),
            ]);
          }
          return jsonResponse([]);
        }
        return jsonResponse({ error: "not found" }, 404);
      }),
    );

    const response = await GET(
      requestUrl(
        "title=One%20of%20Your%20Girls&artist=Sped%20Up%20Uploader&album=One%20of%20Your%20Girls&duration=129",
      ),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.found).toBe(true);
    expect(payload.syncedLyrics).toBeNull();
    expect(payload.plainLyrics).toContain("original first line");
    expect(titleOnlyCalls).toHaveLength(1);
  });

  it("falls back to unsynced lyrics when the synced catalog misses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = new URL(String(input));
        if (url.hostname === "lrclib.net") return jsonResponse([]);
        return jsonResponse({
          lyrics:
            "Paroles de la chanson Fallback Song par Fallback Artist\n\nfirst fallback line\nsecond fallback line",
        });
      }),
    );

    const response = await GET(
      requestUrl(
        "title=Fallback%20Song&artist=Fallback%20Artist&duration=190",
      ),
    );
    const payload = await response.json();

    expect(payload.found).toBe(true);
    expect(payload.syncedLyrics).toBeNull();
    expect(payload.plainLyrics).toBe(
      "first fallback line\nsecond fallback line",
    );
  });

  it("uses LRCLIB search when the exact endpoint is temporarily overloaded", async () => {
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = new URL(String(input));
        calls.push(url.toString());
        if (url.hostname === "lrclib.net") {
          if (url.pathname === "/api/get") {
            return jsonResponse({ message: "busy", statusCode: 503 }, 503);
          }
          return jsonResponse([
            lrclibItem({
              trackName: "She Knows",
              artistName: "J. Cole",
              albumName: "Born Sinner",
              duration: 296,
              syncedLyrics: "[00:01.00] synced line",
            }),
          ]);
        }
        return jsonResponse({
          lyrics: "plain fallback\nsecond fallback line",
        });
      }),
    );

    const response = await GET(
      requestUrl(
        "title=She%20Knows&artist=J.%20Cole&album=Born%20Sinner&duration=296",
      ),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.found).toBe(true);
    expect(payload.syncedLyrics).toContain("synced line");
    expect(
      calls.some(
        (url) =>
          url.includes("lrclib.net/api/search") &&
          url.includes("artist_name=J.+Cole"),
      ),
    ).toBe(true);
  });

  it("tries the primary artist with the cleaned title", async () => {
    const searches: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = new URL(String(input));
        if (url.hostname === "lrclib.net") {
          if (url.pathname === "/api/get") {
            return jsonResponse({ message: "busy", statusCode: 503 }, 503);
          }
          searches.push(url.toString());
          const title = url.searchParams.get("track_name");
          const artist = url.searchParams.get("artist_name");
          if (title === "She Knows" && artist === "J. Cole") {
            return jsonResponse([
              lrclibItem({
                trackName: "She Knows",
                artistName: "J. Cole",
                albumName: "Born Sinner (Deluxe Version)",
                duration: 297,
                syncedLyrics: "[00:07.91] She knows",
              }),
            ]);
          }
          return jsonResponse([]);
        }
        return jsonResponse({
          lyrics: "plain fallback\nsecond fallback line",
        });
      }),
    );

    const response = await GET(
      requestUrl(
        "title=She%20Knows%20(feat.%20Amber%20Coffman%20%26%20Cults)&artist=J.%20Cole%2C%20Cults%2C%20Amber%20Coffman&album=Born%20Sinner%20(Deluxe%20Version)&duration=297",
      ),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.syncedLyrics).toContain("She knows");
    expect(
      searches.some(
        (url) =>
          url.includes("track_name=She+Knows") &&
          url.includes("artist_name=J.+Cole"),
      ),
    ).toBe(true);
  });

  it("marks outage fallbacks retryable and bypasses the cache on refresh", async () => {
    let recovered = false;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = new URL(String(input));
        if (url.hostname === "lrclib.net") {
          if (!recovered) {
            return jsonResponse({ message: "busy", statusCode: 503 }, 503);
          }
          return jsonResponse([
            lrclibItem({
              trackName: "Recover Song",
              artistName: "Recover Artist",
              albumName: "Recover Album",
              duration: 180,
              syncedLyrics: "[00:01.00] recovered line",
            }),
          ]);
        }
        return jsonResponse({
          lyrics: "plain fallback\nsecond fallback line",
        });
      }),
    );

    const first = await GET(
      requestUrl(
        "title=Recover%20Song&artist=Recover%20Artist&album=Recover%20Album&duration=180",
      ),
    );
    const firstPayload = await first.json();
    expect(firstPayload.syncedLyrics).toBeNull();
    expect(firstPayload.retryable).toBe(true);

    recovered = true;
    const second = await GET(
      requestUrl(
        "title=Recover%20Song&artist=Recover%20Artist&album=Recover%20Album&duration=180&refresh=1",
      ),
    );
    const secondPayload = await second.json();
    expect(secondPayload.syncedLyrics).toContain("recovered line");
    expect(secondPayload.retryable).toBe(false);
  });

  it("stops calling LRCLIB after an overload and fails over directly", async () => {
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = new URL(String(input));
        calls.push(url.toString());
        if (url.hostname === "lrclib.net") {
          return jsonResponse(
            { message: "busy", statusCode: 503 },
            503,
          );
        }
        return jsonResponse({ error: "not found" }, 404);
      }),
    );

    const started = Date.now();
    const response = await GET(
      requestUrl(
        "title=Busy%20Song&artist=Busy%20Artist&album=Busy%20Album&duration=180",
      ),
    );
    const elapsed = Date.now() - started;

    expect(response.status).toBe(502);
    // The exact lookup plus the parallel title-only probe, then stop.
    expect(
      calls.filter((url) => url.includes("lrclib.net")).length,
    ).toBeLessThanOrEqual(2);
    expect(elapsed).toBeLessThan(3_000);
  });

  it("reports a service error instead of calling an outage a miss", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("offline");
      }),
    );

    const response = await GET(
      requestUrl("title=Offline%20Song&artist=Offline%20Artist&duration=180"),
    );

    expect(response.status).toBe(502);
  });

  it("caches a confirmed miss so repeat lookups stay local", async () => {
    let calls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        calls += 1;
        const url = new URL(String(input));
        if (url.hostname === "lrclib.net") return jsonResponse([]);
        return jsonResponse({ error: "not found" }, 404);
      }),
    );

    const query = "title=Missing%20Song%20Cache%20Test&artist=Missing%20Artist&duration=180";
    const first = await GET(requestUrl(query));
    const firstCalls = calls;
    const second = await GET(requestUrl(query));

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect((await first.json()).found).toBe(false);
    expect((await second.json()).found).toBe(false);
    expect(calls).toBe(firstCalls);
  });

  it("keeps instrumental tracks marked as instrumental", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = new URL(String(input));
        if (url.hostname === "lrclib.net") {
          return jsonResponse([
            lrclibItem({
              trackName: "Instrumental Piece",
              artistName: "Ambient Artist",
              instrumental: true,
              plainLyrics: null,
              syncedLyrics: null,
            }),
          ]);
        }
        return jsonResponse({ error: "not found" }, 404);
      }),
    );

    const response = await GET(
      requestUrl(
        "title=Instrumental%20Piece&artist=Ambient%20Artist&duration=240",
      ),
    );
    const payload = await response.json();

    expect(payload.found).toBe(true);
    expect(payload.instrumental).toBe(true);
    expect(payload.syncedLyrics).toBeNull();
  });
});
