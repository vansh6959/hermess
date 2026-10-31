import "server-only";
import { SpotifyApiError } from "./server";
import type { ManageablePlaylist } from "./playlist-types";

const API = "https://api.spotify.com/v1";
const TIMEOUT_MS = 12_000;
const PAGE_SIZE = 50;

interface SpotifyImage {
  url?: string;
  width?: number | null;
}

interface SpotifyPlaylist {
  id?: string;
  name?: string;
  description?: string | null;
  images?: SpotifyImage[];
  owner?: { id?: string; display_name?: string | null };
  collaborative?: boolean;
  external_urls?: { spotify?: string };
  tracks?: { total?: number };
}

interface Paged<T> {
  items?: Array<T | null>;
  next?: string | null;
}

function pickImage(images: SpotifyImage[] | undefined): string | null {
  const available = (images ?? []).filter((image) => Boolean(image.url));
  if (available.length === 0) return null;
  return (
    [...available].sort((a, b) => (b.width ?? 0) - (a.width ?? 0))[0]?.url ??
    null
  );
}

function mapPlaylist(item: SpotifyPlaylist): ManageablePlaylist | null {
  if (!item.id || !item.name) return null;
  return {
    id: item.id,
    name: item.name,
    description: item.description ?? null,
    imageUrl: pickImage(item.images),
    trackCount: item.tracks?.total ?? 0,
    ownerName: item.owner?.display_name ?? "You",
    collaborative: Boolean(item.collaborative),
    url:
      item.external_urls?.spotify ??
      `https://open.spotify.com/playlist/${item.id}`,
  };
}

function errorForResponse(response: Response): SpotifyApiError {
  if (response.status === 429) {
    const value = Number(response.headers.get("retry-after"));
    const retryAfter =
      Number.isFinite(value) && value > 0 ? Math.ceil(value) : undefined;
    return new SpotifyApiError(
      "rate_limited",
      retryAfter
        ? `Spotify is rate-limiting playlist changes. Try again in ${retryAfter}s.`
        : "Spotify is rate-limiting playlist changes. Try again shortly.",
      { status: 429, retryAfter },
    );
  }
  if (response.status === 401) {
    return new SpotifyApiError(
      "unauthorized",
      "Your Spotify session expired. Reconnect your account.",
      { status: 401 },
    );
  }
  if (response.status === 403) {
    return new SpotifyApiError(
      "forbidden",
      "Spotify rejected this playlist change. Reconnect Spotify to grant playlist editing, or choose a playlist you own or collaborate on.",
      { status: 403 },
    );
  }
  if (response.status === 404) {
    return new SpotifyApiError(
      "unavailable",
      "That playlist or track is no longer available on Spotify.",
      { status: 404 },
    );
  }
  return new SpotifyApiError(
    "unavailable",
    "Spotify could not complete the playlist change.",
    { status: response.status },
  );
}

async function spotifyFetch(
  token: string,
  input: string,
  init: RequestInit = {},
): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  headers.set("Accept", "application/json");

  let response: Response;
  try {
    response = await fetch(input, {
      ...init,
      headers,
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new SpotifyApiError(
      "network",
      "Could not reach Spotify. Check the connection and try again.",
    );
  }
  if (!response.ok) throw errorForResponse(response);
  return response;
}

export async function listManageablePlaylists(
  token: string,
  userId: string,
): Promise<ManageablePlaylist[]> {
  const playlists: ManageablePlaylist[] = [];
  const seenPages = new Set<string>();
  let next: string | null = `${API}/me/playlists?limit=${PAGE_SIZE}`;

  while (next && !seenPages.has(next)) {
    seenPages.add(next);
    const response = await spotifyFetch(token, next);
    const page = (await response.json().catch(() => null)) as Paged<SpotifyPlaylist> | null;
    if (!page) {
      throw new SpotifyApiError(
        "invalid_response",
        "Spotify returned an unreadable playlist list.",
      );
    }
    for (const item of page.items ?? []) {
      if (!item) continue;
      if (item.owner?.id !== userId && !item.collaborative) continue;
      const mapped = mapPlaylist(item);
      if (mapped) playlists.push(mapped);
    }
    next = page.next ?? null;
  }

  return playlists;
}

export async function createPlaylist(
  token: string,
  userId: string,
  input: { name: string; description?: string; isPublic: boolean },
): Promise<ManageablePlaylist> {
  const response = await spotifyFetch(
    token,
    `${API}/users/${encodeURIComponent(userId)}/playlists`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: input.name,
        description: input.description ?? "",
        public: input.isPublic,
      }),
    },
  );
  const payload = (await response.json().catch(() => null)) as SpotifyPlaylist | null;
  const mapped = payload ? mapPlaylist(payload) : null;
  if (!mapped) {
    throw new SpotifyApiError(
      "invalid_response",
      "Spotify created the playlist but returned an unreadable response.",
    );
  }
  return mapped;
}

async function rawFetch(
  token: string,
  input: string,
  init: RequestInit,
): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  headers.set("Accept", "application/json");
  try {
    return await fetch(input, {
      ...init,
      headers,
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new SpotifyApiError(
      "network",
      "Could not reach Spotify. Check the connection and try again.",
    );
  }
}

export async function addTrackToPlaylist(
  token: string,
  playlistId: string,
  trackId: string,
): Promise<void> {
  const uri = `spotify:track:${trackId}`;
  const base = `${API}/playlists/${encodeURIComponent(playlistId)}`;
  const init: RequestInit = {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ uris: [uri] }),
  };

  // Spotify's current endpoint is /items; older apps still receive /tracks.
  // A missing route is not a missing playlist, so only fall back on 400/404.
  const current = await rawFetch(token, `${base}/items`, init);
  if (current.ok) return;
  if (current.status === 400 || current.status === 404) {
    const legacy = await rawFetch(token, `${base}/tracks`, init);
    if (legacy.ok) return;
    throw errorForResponse(legacy);
  }
  throw errorForResponse(current);
}
