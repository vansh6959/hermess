import { NextResponse, type NextRequest } from "next/server";
import { readSpotifyConfig } from "@/lib/spotify/server";
import { readUserAccess, type UserAccess } from "@/lib/spotify/user-token";
import {
  isSecureRequest,
  setRefreshedTokens,
} from "@/lib/spotify/cookies";
import type {
  ImportedPlaylist,
  ImportedTrack,
} from "@/lib/import/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const API = "https://api.spotify.com/v1";
const PLAYLIST_PAGE = 100;
const LIKED_PAGE = 50;
const CONCURRENCY = 4;
const REQUEST_TIMEOUT_MS = 15_000;

interface SpotifyImage {
  url?: string;
  width?: number | null;
}

interface SpotifyTrackPayload {
  id?: string;
  name?: string;
  artists?: Array<{ name?: string }>;
  album?: { name?: string; images?: SpotifyImage[] };
  duration_ms?: number;
  external_urls?: { spotify?: string };
  is_local?: boolean;
}

interface SpotifyPlaylistPayload {
  id?: string;
  name?: string;
  description?: string | null;
  images?: SpotifyImage[];
  tracks?: { total?: number };
  external_urls?: { spotify?: string };
}

interface Paged<T> {
  items?: Array<T | null>;
  next?: string | null;
}

type FetchResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number };

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJson<T>(
  url: string,
  headers: HeadersInit,
): Promise<FetchResult<T>> {
  let lastStatus = 0;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await fetch(url, {
      headers,
      cache: "no-store",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    }).catch(() => null);
    if (!response) {
      lastStatus = 0;
      if (attempt < 2) {
        await sleep(300 * (attempt + 1));
        continue;
      }
      return { ok: false, status: lastStatus };
    }
    if (response.status === 429 || response.status >= 500) {
      lastStatus = response.status;
      if (attempt < 2) {
        const retryAfter = Number(response.headers.get("retry-after") ?? "0");
        await sleep(Math.min(3_000, Math.max(350, retryAfter * 1_000)));
        continue;
      }
      return { ok: false, status: lastStatus };
    }
    if (!response.ok) return { ok: false, status: response.status };
    const data = (await response.json().catch(() => null)) as T | null;
    if (!data) return { ok: false, status: response.status };
    return { ok: true, data };
  }
  return { ok: false, status: lastStatus };
}

interface PlaylistTrackEntry {
  track?: SpotifyTrackPayload | null;
  item?: SpotifyTrackPayload | null;
}

function pickImage(
  images: SpotifyImage[] | null | undefined,
): string | null {
  const available = images?.filter((image) => Boolean(image.url)) ?? [];
  if (available.length === 0) return null;
  const sorted = [...available].sort(
    (a, b) => (a.width ?? 0) - (b.width ?? 0),
  );
  return (
    sorted.find((image) => (image.width ?? 0) >= 280)?.url ??
    sorted[sorted.length - 1]?.url ??
    null
  );
}

function mapTrack(track: SpotifyTrackPayload | null | undefined): ImportedTrack | null {
  if (!track?.id || track.is_local || !track.name) return null;
  return {
    id: track.id,
    source: "spotify",
    name: track.name,
    artists:
      (track.artists ?? [])
        .map((artist) => artist.name)
        .filter((name): name is string => Boolean(name))
        .join(", ") || "Unknown artist",
    albumName: track.album?.name ?? "Single",
    imageUrl: pickImage(track.album?.images),
    durationMs: Math.max(0, track.duration_ms ?? 0),
    url:
      track.external_urls?.spotify ??
      `https://open.spotify.com/track/${track.id}`,
  };
}

function spotifyError(
  message: string,
  status: number,
  needsScope = false,
) {
  return NextResponse.json(
    {
      error: { code: needsScope ? "needs_scope" : "spotify_error", message },
      ...(needsScope ? { needsScope: true } : {}),
    },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

function success(
  request: NextRequest,
  access: UserAccess,
  payload: { playlists: ImportedPlaylist[]; likedSongs: ImportedTrack[] },
) {
  const response = NextResponse.json(
    { source: "spotify", ...payload },
    { headers: { "Cache-Control": "no-store" } },
  );
  if (access.refreshed) {
    setRefreshedTokens(response, access.refreshed, isSecureRequest(request));
  }
  return response;
}

async function fetchPlaylist(
  item: SpotifyPlaylistPayload,
  headers: HeadersInit,
): Promise<ImportedPlaylist | null> {
  if (!item.id) return null;
  const tracks: ImportedTrack[] = [];
  const base = `${API}/playlists/${encodeURIComponent(item.id)}`;
  const seenPages = new Set<string>();
  let url: string | null = `${base}/items?limit=${PLAYLIST_PAGE}&offset=0`;
  let firstPage = true;
  let usedTracksFallback = false;

  while (url) {
    if (seenPages.has(url)) break;
    seenPages.add(url);

    let page: FetchResult<Paged<PlaylistTrackEntry>> = await fetchJson<
      Paged<PlaylistTrackEntry>
    >(url, headers);
    if (
      !page.ok &&
      firstPage &&
      !usedTracksFallback &&
      (page.status === 404 || page.status === 400)
    ) {
      // Older apps still receive the legacy /tracks shape; mirror Spotify's
      // documented items-first contract while keeping the fallback.
      usedTracksFallback = true;
      url = `${base}/tracks?limit=${PLAYLIST_PAGE}&offset=0`;
      if (seenPages.has(url)) break;
      seenPages.add(url);
      page = await fetchJson<Paged<PlaylistTrackEntry>>(url, headers);
    }
    firstPage = false;

    if (!page.ok) {
      if (tracks.length > 0) {
        console.warn(
          `[spotify] import stopped playlist track pagination: status ${page.status} with ${tracks.length} tracks preserved`,
        );
      }
      break;
    }

    for (const entry of page.data.items ?? []) {
      const track = mapTrack(entry?.item ?? entry?.track);
      if (track) tracks.push(track);
    }
    url = page.data.next ?? null;
  }

  return {
    id: item.id,
    source: "spotify",
    name: item.name ?? "Spotify playlist",
    description: item.description ?? null,
    imageUrl:
      pickImage(item.images) ?? tracks[0]?.imageUrl ?? null,
    trackCount: tracks.length,
    tracks,
    url: item.external_urls?.spotify ?? null,
    importedAt: Date.now(),
  };
}

async function mapWithConcurrency<T, R>(
  values: T[],
  limit: number,
  mapper: (value: T) => Promise<R>,
): Promise<R[]> {
  const output: R[] = [];
  let cursor = 0;
  const workers = Array.from(
    { length: Math.min(limit, values.length) },
    async () => {
      while (cursor < values.length) {
        const index = cursor;
        cursor += 1;
        output[index] = await mapper(values[index]);
      }
    },
  );
  await Promise.all(workers);
  return output;
}

export async function GET(request: NextRequest) {
  const config = readSpotifyConfig();
  if (!config) {
    return spotifyError("Spotify is not configured on the server.", 503);
  }

  const access = await readUserAccess(request, config);
  if (!access) {
    return NextResponse.json(
      {
        error: {
          code: "reconnect_required",
          message: "Connect Spotify to import your library.",
        },
        needsConnect: true,
      },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  const headers = {
    Authorization: `Bearer ${access.token}`,
    Accept: "application/json",
  };

  try {
    const playlistItems: SpotifyPlaylistPayload[] = [];
    const seenPlaylistPages = new Set<string>();
    let playlistsUrl: string | null = `${API}/me/playlists?limit=50`;
    while (playlistsUrl) {
      if (seenPlaylistPages.has(playlistsUrl)) break;
      seenPlaylistPages.add(playlistsUrl);
      const page: FetchResult<Paged<SpotifyPlaylistPayload>> =
        await fetchJson<Paged<SpotifyPlaylistPayload>>(
          playlistsUrl,
          headers,
        );
      if (!page.ok) {
        if (page.status === 401 || page.status === 403) {
          return spotifyError(
            "Reconnect Spotify to grant playlist and liked-songs access.",
            403,
            true,
          );
        }
        if (playlistItems.length === 0) {
          return spotifyError(
            "Spotify could not load your playlists. Try again.",
            502,
          );
        }
        console.warn(
          `[spotify] import stopped playlist pagination: status ${page.status} with ${playlistItems.length} playlists preserved`,
        );
        break;
      }
      for (const item of page.data.items ?? []) {
        if (item?.id) playlistItems.push(item);
      }
      playlistsUrl = page.data.next ?? null;
    }

    const likedSongs: ImportedTrack[] = [];
    const seenLikedPages = new Set<string>();
    let likedUrl: string | null = `${API}/me/tracks?limit=${LIKED_PAGE}`;
    while (likedUrl) {
      if (seenLikedPages.has(likedUrl)) break;
      seenLikedPages.add(likedUrl);
      const page: FetchResult<
        Paged<{ track?: SpotifyTrackPayload | null }>
      > = await fetchJson<Paged<{ track?: SpotifyTrackPayload | null }>>(
        likedUrl,
        headers,
      );
      if (!page.ok) {
        if (page.status === 401 || page.status === 403) {
          return spotifyError(
            "Reconnect Spotify to grant liked-songs access.",
            403,
            true,
          );
        }
        if (likedSongs.length > 0) {
          console.warn(
            `[spotify] import stopped liked-song pagination: status ${page.status} with ${likedSongs.length} liked songs preserved`,
          );
        }
        break;
      }
      for (const entry of page.data.items ?? []) {
        const track = mapTrack(entry?.track);
        if (track) likedSongs.push(track);
      }
      likedUrl = page.data.next ?? null;
    }

    const playlistResults = await mapWithConcurrency(
      playlistItems,
      CONCURRENCY,
      (item) => fetchPlaylist(item, headers),
    );
    const playlists = playlistResults.filter(
      (playlist): playlist is ImportedPlaylist => Boolean(playlist),
    );

    const playlistTrackCount = playlists.reduce(
      (total, playlist) => total + playlist.tracks.length,
      0,
    );
    console.info(
      `[spotify] import complete: ${playlists.length} playlists, ${playlistTrackCount} playlist tracks, ${likedSongs.length} liked songs`,
    );

    return success(request, access, { playlists, likedSongs });
  } catch {
    return spotifyError(
      "Spotify could not complete the import. Try again.",
      502,
    );
  }
}
