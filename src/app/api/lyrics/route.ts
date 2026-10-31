import { NextResponse } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const lyricSchema = z
  .object({
    id: z.number().optional(),
    trackName: z.string(),
    artistName: z.string(),
    albumName: z.string().nullish(),
    duration: z.number().nullish(),
    instrumental: z.boolean().nullish(),
    plainLyrics: z.string().nullish(),
    syncedLyrics: z.string().nullish(),
  })
  .passthrough();

const searchSchema = z.array(lyricSchema);

type LyricResult = z.infer<typeof lyricSchema>;

interface LyricsPayload {
  found: boolean;
  syncedLyrics: string | null;
  plainLyrics: string | null;
  instrumental: boolean;
  retryable?: boolean;
}

interface ServiceResult<T> {
  ok: boolean;
  data: T;
}

const HOUR_MS = 60 * 60 * 1000;
const CACHE_TTL_MS = 6 * HOUR_MS;
const MISS_TTL_MS = 30 * 60 * 1000;
// A fallback caused by an LRCLIB outage may recover in seconds. Do not pin
// plain lyrics to the client for six hours because of a transient 502.
const RETRYABLE_TTL_MS = 2 * 60 * 1000;
const TOTAL_BUDGET_MS = 4_500;
const LRCLIB_TIMEOUT_MS = 2_000;
const TITLE_TIMEOUT_MS = 3_200;
const FALLBACK_TIMEOUT_MS = 1_500;
const RETRY_DELAY_MS = 250;
const MIN_SCORE = 125;
const GOOD_ENOUGH_SCORE = 170;
const USER_AGENT = "Hermes/0.1 (local music player; lyrics via LRCLIB)";

const cache = new Map<
  string,
  { expires: number; payload: LyricsPayload }
>();

const ARTIST_SEPARATOR =
  /\s*(?:,|&|;)\s*|\s+\b(?:feat\.?|ft\.?|with)\b\s+|\s+x\s+/i;

const TITLE_NOISE = [
  /\s*[([]\s*(?:feat\.?|ft\.?|with)\b[^)\]]*[)\]]/gi,
  /\s*[([]\s*(?:remaster(?:ed)?|deluxe|bonus|radio edit|single version|album version|live|acoustic|mono|stereo|sped up|slowed(?: down)?|reverb)\b[^)\]]*[)\]]/gi,
  /\s+-\s+(?:remaster(?:ed)?|deluxe|bonus|radio edit|single version|album version|live|acoustic|mono|stereo|sped up|slowed(?: down)?|reverb)(?:\s+\d{4})?$/gi,
  /\s+\b(?:feat\.?|ft\.?)\s+.+$/gi,
];

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function unique(values: string[]): string[] {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed || seen.has(trimmed.toLowerCase())) continue;
    seen.add(trimmed.toLowerCase());
    output.push(trimmed);
  }
  return output;
}

function normalize(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/['’`]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function artistVariants(artist: string): string[] {
  const parts = artist
    .split(ARTIST_SEPARATOR)
    .map((part) => part.trim())
    .filter(Boolean);
  return unique([artist, ...parts]).slice(0, 4);
}

function titleVariants(title: string): string[] {
  let cleaned = title;
  for (const pattern of TITLE_NOISE) cleaned = cleaned.replace(pattern, " ");
  cleaned = cleaned.replace(/\s{2,}/g, " ").trim();
  return unique([title, cleaned]).filter(Boolean).slice(0, 2);
}

async function request(
  url: string,
  timeoutMs: number,
  attempts = 1,
): Promise<Response | null> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: {
          Accept: "application/json",
          "User-Agent": USER_AGENT,
        },
        cache: "no-store",
        signal: AbortSignal.timeout(timeoutMs),
      });
      const transient = response.status === 429 || response.status >= 500;
      if (transient && attempt < attempts - 1) {
        await delay(RETRY_DELAY_MS);
        continue;
      }
      return response;
    } catch {
      if (attempt < attempts - 1) {
        await delay(RETRY_DELAY_MS);
        continue;
      }
      return null;
    }
  }
  return null;
}

async function searchLrclib(
  artist: string | null,
  title: string,
  album?: string,
  timeoutMs = LRCLIB_TIMEOUT_MS,
): Promise<ServiceResult<LyricResult[]>> {
  const params = new URLSearchParams({
    track_name: title,
  });
  if (artist) params.set("artist_name", artist);
  if (album) params.set("album_name", album);

  const response = await request(
    `https://lrclib.net/api/search?${params}`,
    timeoutMs,
  );
  if (!response) return { ok: false, data: [] };
  if (response.status === 429 || response.status >= 500) {
    return { ok: false, data: [] };
  }
  if (!response.ok) return { ok: true, data: [] };

  const payload = await response.json().catch(() => null);
  const parsed = searchSchema.safeParse(payload);
  return { ok: true, data: parsed.success ? parsed.data : [] };
}

async function fetchLrclibExact(
  artist: string,
  title: string,
  album: string,
  duration: number,
  timeoutMs = LRCLIB_TIMEOUT_MS,
): Promise<ServiceResult<LyricResult | null>> {
  if (duration <= 0) return { ok: true, data: null };
  const params = new URLSearchParams({
    track_name: title,
    artist_name: artist,
    duration: String(Math.round(duration)),
  });
  if (album) params.set("album_name", album);

  const response = await request(
    `https://lrclib.net/api/get?${params}`,
    timeoutMs,
  );
  if (!response) return { ok: false, data: null };
  if (response.status === 404) return { ok: true, data: null };
  if (response.status === 429 || response.status >= 500) {
    return { ok: false, data: null };
  }
  if (!response.ok) return { ok: true, data: null };

  const payload = await response.json().catch(() => null);
  const parsed = lyricSchema.safeParse(payload);
  return { ok: true, data: parsed.success ? parsed.data : null };
}

async function fetchFallbackLyrics(
  artist: string,
  title: string,
  timeoutMs = FALLBACK_TIMEOUT_MS,
): Promise<ServiceResult<string | null>> {
  const response = await request(
    `https://api.lyrics.ovh/v1/${encodeURIComponent(artist)}/${encodeURIComponent(title)}`,
    timeoutMs,
    1,
  );
  if (!response) return { ok: false, data: null };
  if (response.status === 404) return { ok: true, data: null };
  if (!response.ok) return { ok: false, data: null };

  const payload = (await response.json().catch(() => null)) as {
    lyrics?: unknown;
  } | null;
  if (!payload || typeof payload.lyrics !== "string") {
    return { ok: true, data: null };
  }
  const text = payload.lyrics
    .replace(/\r\n?/g, "\n")
    .replace(/^Paroles de la chanson[^\n]*\n+/i, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return { ok: true, data: text.length >= 20 ? text : null };
}

function scoreCandidate(
  item: LyricResult,
  titles: string[],
  artists: string[],
  album: string,
  duration: number,
): number {
  const itemTitle = normalize(item.trackName);
  if (!itemTitle) return Number.NEGATIVE_INFINITY;

  const titleHits = titles.map(normalize).filter(Boolean);
  const exactTitle = titleHits.some((candidate) => candidate === itemTitle);
  const looseTitle =
    exactTitle ||
    titleHits.some(
      (candidate) =>
        itemTitle.includes(candidate) || candidate.includes(itemTitle),
    );
  if (!looseTitle) return Number.NEGATIVE_INFINITY;

  let score = 100 + (exactTitle ? 40 : 10);

  const itemArtist = normalize(item.artistName);
  const artistHits = artists.map(normalize).filter(Boolean);
  if (artistHits.some((candidate) => candidate === itemArtist)) {
    score += 60;
  } else if (
    artistHits.some(
      (candidate) =>
        itemArtist.includes(candidate) || candidate.includes(itemArtist),
    )
  ) {
    score += 35;
  } else {
    score -= 20;
  }

  if (album && item.albumName && normalize(item.albumName) === normalize(album)) {
    score += 20;
  }
  if (item.syncedLyrics) score += 30;
  else if (item.plainLyrics) score += 10;

  if (duration > 0 && item.duration) {
    const delta = Math.abs(item.duration - duration);
    if (delta <= 3) score += 15;
    else score -= Math.min(80, delta);
  }

  return score;
}

function hasLyrics(item: LyricResult): boolean {
  return Boolean(item.syncedLyrics || item.plainLyrics || item.instrumental);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const title = (url.searchParams.get("title") ?? "").trim();
  const artist = (url.searchParams.get("artist") ?? "").trim();
  const album = (url.searchParams.get("album") ?? "").trim();
  const duration = Number(url.searchParams.get("duration") ?? "0");

  if (title.length < 1 || artist.length < 1) {
    return NextResponse.json(
      { error: "title and artist are required" },
      { status: 400 },
    );
  }
  if (title.length > 200 || artist.length > 200 || album.length > 200) {
    return NextResponse.json({ error: "query too long" }, { status: 400 });
  }

  const key = `v2|${normalize(title)}|${normalize(artist)}|${normalize(album)}|${Math.round(duration)}`;
  const refresh = url.searchParams.get("refresh") === "1";
  const cached = refresh ? undefined : cache.get(key);
  if (cached && cached.expires > Date.now()) {
    return NextResponse.json(cached.payload, {
      headers: { "Cache-Control": "public, max-age=3600" },
    });
  }

  const titles = titleVariants(title);
  const artists = artistVariants(artist);
  const targetDuration = Number.isFinite(duration) ? duration : 0;
  const startedAt = Date.now();
  const remaining = () => TOTAL_BUDGET_MS - (Date.now() - startedAt);

  type Candidate = { item: LyricResult; score: number };
  // Timing data is the whole point of the lyrics panel, so a synced match
  // always outranks a plain one even when the plain match is closer by album
  // or duration. Only search further when no synced candidate is good yet.
  let bestSynced: Candidate | null = null;
  let bestFallback: Candidate | null = null;
  let lrclibFailed = false;

  const take = (items: LyricResult[]) => {
    for (const item of items) {
      if (!hasLyrics(item)) continue;
      const score = scoreCandidate(
        item,
        titles,
        artists,
        album,
        targetDuration,
      );
      if (score < MIN_SCORE) continue;
      const candidate = { item, score };
      if (item.syncedLyrics?.trim()) {
        if (!bestSynced || score > bestSynced.score) bestSynced = candidate;
      } else if (!bestFallback || score > bestFallback.score) {
        bestFallback = candidate;
      }
    }
  };
  const bestSoFar = (): Candidate | null => bestSynced ?? bestFallback;

  // Start the title-only search alongside the artist-specific work when the
  // title is distinctive. It finds the original recording's words for sped-up
  // or remix uploads whose artist name does not exist in the catalog.
  const titleWords = normalize(titles[0]).split(" ").filter(Boolean);
  let titleOnlyPromise: Promise<ServiceResult<LyricResult[]>> | null = null;
  const startTitleOnly = () => {
    if (titleOnlyPromise || titleWords.length < 3 || remaining() < 800) return;
    titleOnlyPromise = searchLrclib(
      null,
      titles[0],
      undefined,
      Math.min(TITLE_TIMEOUT_MS, remaining()),
    );
  };
  const titleOnlyTask = () => titleOnlyPromise;
  startTitleOnly();

  if (targetDuration > 0 && remaining() > 600) {
    const exact = await fetchLrclibExact(
      artists[0],
      titles[0],
      album,
      targetDuration,
      Math.min(LRCLIB_TIMEOUT_MS, remaining()),
    );
    // A 503/429 from /api/get does not mean /api/search is down. Keep the
    // circuit breaker for repeated search failures, but let the search query
    // below recover synced lyrics from a temporarily overloaded exact lookup.
    if (exact.data) take([exact.data]);

    if (
      !bestSynced &&
      exact.ok &&
      !exact.data &&
      album &&
      remaining() > 600
    ) {
      const withoutAlbum = await fetchLrclibExact(
        artists[0],
        titles[0],
        "",
        targetDuration,
        Math.min(LRCLIB_TIMEOUT_MS, remaining()),
      );
      if (withoutAlbum.data) take([withoutAlbum.data]);
    }
  }

  const queries: Array<{ artist: string; title: string; album?: string }> = [];
  const seenQueries = new Set<string>();
  const addQuery = (artist: string, title: string, queryAlbum?: string) => {
    if (!artist || !title) return;
    const queryKey = `${normalize(artist)}|${normalize(title)}|${normalize(
      queryAlbum ?? "",
    )}`;
    if (seenQueries.has(queryKey)) return;
    seenQueries.add(queryKey);
    queries.push({
      artist,
      title,
      ...(queryAlbum ? { album: queryAlbum } : {}),
    });
  };

  // Billed artist strings often contain collaborators while the credits are
  // listed on the primary artist. Pair both the cleaned title and the primary
  // artist, or a track like "She Knows (feat. …)" never reaches its synced
  // LRCLIB entry.
  const primaryArtist = artists[1] ?? artists[0];
  const cleanTitle = titles[1] ?? titles[0];
  addQuery(artists[0], titles[0], album || undefined);
  addQuery(primaryArtist, cleanTitle, album || undefined);
  addQuery(primaryArtist, cleanTitle);
  addQuery(primaryArtist, titles[0]);
  if (cleanTitle !== titles[0]) addQuery(artists[0], cleanTitle);

  for (const query of queries) {
    if (lrclibFailed || remaining() < 600) break;
    const current = bestSoFar();
    if (
      current?.item.syncedLyrics?.trim() &&
      current.score >= GOOD_ENOUGH_SCORE
    ) {
      break;
    }
    const result = await searchLrclib(
      query.artist,
      query.title,
      query.album,
      Math.min(LRCLIB_TIMEOUT_MS, remaining()),
    );
    if (!result.ok) lrclibFailed = true;
    take(result.data);
  }

  const winner = bestSoFar();
  if (winner) {
    const item = winner.item;
    const instrumental = Boolean(
      item.instrumental && !item.syncedLyrics && !item.plainLyrics,
    );
    const payload: LyricsPayload = {
      found: true,
      syncedLyrics: item.syncedLyrics ?? null,
      plainLyrics: item.plainLyrics ?? null,
      instrumental,
      retryable: false,
    };
    if (cache.size > 300) cache.clear();
    cache.set(key, { expires: Date.now() + CACHE_TTL_MS, payload });
    return NextResponse.json(payload, {
      headers: { "Cache-Control": "public, max-age=3600" },
    });
  }

  let fallbackFailed = false;
  let fallbackLyrics: string | null = null;

  // Sped-up/remix uploads often sit under an unknown artist while the original
  // recording carries the same words. For distinctive titles, accept its plain
  // lyrics (never its timings, which belong to a different edit).
  const pendingTitleOnly = titleOnlyTask();
  if (!fallbackLyrics && pendingTitleOnly) {
    const titleOnly = await pendingTitleOnly;
    if (titleOnly.ok) {
      // A reachable title-only endpoint means the service is not fully down.
      lrclibFailed = false;
      const wanted = normalize(titles[0]);
      const candidate = titleOnly.data.find((item) => {
        if (normalize(item.trackName) !== wanted) return false;
        if (!item.plainLyrics || item.plainLyrics.trim().length < 20) {
          return false;
        }
        const albumMatch =
          Boolean(album) &&
          Boolean(item.albumName) &&
          normalize(item.albumName ?? "") === normalize(album);
        return titleWords.length >= 3 || albumMatch;
      });
      if (candidate?.plainLyrics) {
        fallbackLyrics = candidate.plainLyrics;
      }
    }
  }

  if (!fallbackLyrics && remaining() > 300) {
    const fallbackArtists = unique([
      artists[1] ?? artists[0],
      artists[0],
    ]).slice(0, 2);
    for (const artistName of fallbackArtists) {
      const result = await fetchFallbackLyrics(
        artistName,
        titles[0],
        Math.min(FALLBACK_TIMEOUT_MS, remaining()),
      );
      if (!result.ok) {
        fallbackFailed = true;
        break;
      }
      if (result.data) {
        fallbackLyrics = result.data;
        break;
      }
    }
  }

  if (fallbackLyrics) {
    const retryable = lrclibFailed;
    const payload: LyricsPayload = {
      found: true,
      syncedLyrics: null,
      plainLyrics: fallbackLyrics,
      instrumental: false,
      retryable,
    };
    if (cache.size > 300) cache.clear();
    cache.set(key, {
      expires: Date.now() + (retryable ? RETRYABLE_TTL_MS : CACHE_TTL_MS),
      payload,
    });
    return NextResponse.json(payload, {
      headers: {
        "Cache-Control": retryable
          ? "public, max-age=120"
          : "public, max-age=3600",
      },
    });
  }

  if (lrclibFailed || fallbackFailed) {
    return NextResponse.json(
      { error: "Lyrics service unavailable" },
      { status: 502 },
    );
  }

  const payload: LyricsPayload = {
    found: false,
    syncedLyrics: null,
    plainLyrics: null,
    instrumental: false,
  };
  if (cache.size > 300) cache.clear();
  cache.set(key, { expires: Date.now() + MISS_TTL_MS, payload });
  return NextResponse.json(payload, {
    headers: { "Cache-Control": "public, max-age=600" },
  });
}
