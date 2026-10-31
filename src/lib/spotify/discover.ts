import type {
  SpotifyAlbumResult,
  SpotifySearchData,
} from "./types";

export const DISCOVERY_ARTISTS = [
  "The Weeknd",
  "Eminem",
  "Travis Scott",
  "OneRepublic",
  "Coldplay",
  "Daft Punk",
  "SZA",
  "Billie Eilish",
] as const;

export interface DiscoverCover {
  id: string;
  title: string;
  artist: string;
  imageUrl: string;
  trackId?: string;
  albumId?: string;
}

export interface DiscoverApi {
  search(query: string, limit?: number): Promise<SpotifySearchData>;
  artistAlbums(artistId: string): Promise<SpotifyAlbumResult[]>;
}

export interface DiscoverFailure {
  artist: string;
  code: string;
}

export interface DiscoverResult {
  covers: DiscoverCover[];
  complete: boolean;
  missing: string[];
  failures: DiscoverFailure[];
}

function normalize(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

function albumMatchesArtist(album: SpotifyAlbumResult, artistName: string) {
  const wanted = normalize(artistName);
  return album.artists
    .split(/\s*(?:,|&|;|\bfeat\.?|\bft\.?|\bwith\b)\s*/i)
    .map(normalize)
    .some((artist) => artist === wanted);
}

function coverFromAlbum(album: SpotifyAlbumResult): DiscoverCover | null {
  if (!album.id || !album.name || !album.imageUrl) return null;
  return {
    id: album.id,
    title: album.name,
    artist: album.artists,
    imageUrl: album.imageUrl,
    albumId: album.id,
  };
}

async function coverForArtist(
  api: DiscoverApi,
  name: string,
): Promise<DiscoverCover | null> {
  const search = await api.search(name, 8);
  const wanted = normalize(name);
  const artist = search.artists.find(
    (candidate) => normalize(candidate.name) === wanted,
  );

  let artistAlbums: SpotifyAlbumResult[] = [];
  if (artist?.id) {
    try {
      artistAlbums = await api.artistAlbums(artist.id);
    } catch {
      artistAlbums = [];
    }
  }

  const fromArtist =
    artistAlbums.find(
      (album) => album.imageUrl && albumMatchesArtist(album, name),
    ) ??
    artistAlbums.find((album) => album.imageUrl) ??
    null;

  const fromSearch =
    search.albums.find(
      (album) => album.imageUrl && albumMatchesArtist(album, name),
    ) ?? null;

  const album = fromArtist ?? fromSearch;
  return album ? coverFromAlbum(album) : null;
}

function failureCode(error: unknown): string {
  if (
    error &&
    typeof error === "object" &&
    "code" in error &&
    typeof (error as { code?: unknown }).code === "string"
  ) {
    return (error as { code: string }).code;
  }
  return "error";
}

export async function buildCuratedDiscover(
  api: DiscoverApi,
): Promise<DiscoverResult> {
  const results = await Promise.all(
    DISCOVERY_ARTISTS.map(async (name) => {
      try {
        return { name, cover: await coverForArtist(api, name), code: null };
      } catch (error) {
        return { name, cover: null, code: failureCode(error) };
      }
    }),
  );

  const covers: DiscoverCover[] = [];
  const missing: string[] = [];
  const failures: DiscoverFailure[] = [];
  const seen = new Set<string>();

  for (const result of results) {
    if (!result.cover) {
      missing.push(result.name);
      if (result.code) failures.push({ artist: result.name, code: result.code });
      continue;
    }
    if (seen.has(result.cover.albumId ?? result.cover.id)) continue;
    seen.add(result.cover.albumId ?? result.cover.id);
    covers.push(result.cover);
  }

  return {
    covers,
    complete: missing.length === 0,
    missing,
    failures,
  };
}
