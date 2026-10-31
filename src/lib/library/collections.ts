import type {
  ImportedPlaylist,
  ImportedTrack,
} from "@/lib/import/types";

export type LibraryCollectionKind = "playlist" | "liked" | "album" | "artist";
export type LibraryFilter = "all" | "playlists" | "albums" | "artists";
export type LibrarySort = "recent" | "az";

export interface LibraryCollection {
  key: string;
  kind: LibraryCollectionKind;
  name: string;
  subtitle: string;
  tracks: ImportedTrack[];
  trackCount: number;
  imageUrl: string | null;
  mosaic: string[];
  addedAt: number;
  searchText: string;
  playlistId?: string;
}

export interface LibraryCollections {
  playlists: LibraryCollection[];
  liked: LibraryCollection | null;
  albums: LibraryCollection[];
  artists: LibraryCollection[];
}

function normalize(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function splitArtistCredits(artists: string): string[] {
  return artists
    .split(/\s*(?:,|&|;|\bfeat\.?|\bft\.?|\bwith\b)\s*/i)
    .map((artist) => artist.trim())
    .filter(Boolean);
}

function uniqueTrackImages(tracks: ImportedTrack[], limit = 4): string[] {
  const seen = new Set<string>();
  const images: string[] = [];
  for (const track of tracks) {
    if (!track.imageUrl || seen.has(track.imageUrl)) continue;
    seen.add(track.imageUrl);
    images.push(track.imageUrl);
    if (images.length >= limit) break;
  }
  return images;
}

function searchTextFor(
  name: string,
  subtitle: string,
  tracks: ImportedTrack[],
): string {
  const parts = [name, subtitle];
  for (const track of tracks) {
    parts.push(track.name, track.artists, track.albumName);
  }
  return normalize(parts.join(" "));
}

function playlistTrackList(tracks: ImportedTrack[] | undefined): ImportedTrack[] {
  return Array.isArray(tracks)
    ? tracks.filter((track): track is ImportedTrack => Boolean(track?.id))
    : [];
}

function playlistCollection(playlist: ImportedPlaylist): LibraryCollection {
  const tracks = playlistTrackList(playlist.tracks);
  const subtitle = playlist.description?.trim() || "Playlist";
  return {
    key: `playlist:${playlist.source}:${playlist.id}`,
    kind: "playlist",
    name: playlist.name,
    subtitle,
    tracks,
    trackCount: tracks.length,
    imageUrl: playlist.imageUrl?.trim() || null,
    mosaic: playlist.imageUrl ? [] : uniqueTrackImages(tracks),
    addedAt: Number.isFinite(playlist.importedAt) ? playlist.importedAt : 0,
    searchText: searchTextFor(playlist.name, subtitle, tracks),
    playlistId: playlist.id,
  };
}

function likedCollection(
  likedSongs: ImportedTrack[],
  lastImportedAt: number | null,
): LibraryCollection | null {
  const tracks = playlistTrackList(likedSongs);
  if (tracks.length === 0) return null;
  const subtitle = "Saved tracks";
  return {
    key: "liked:spotify",
    kind: "liked",
    name: "Liked songs",
    subtitle,
    tracks,
    trackCount: tracks.length,
    imageUrl: null,
    mosaic: uniqueTrackImages(tracks),
    addedAt: lastImportedAt ?? 0,
    searchText: searchTextFor("Liked songs", subtitle, tracks),
  };
}

interface DerivedGroup {
  key: string;
  name: string;
  subtitle: string;
  tracks: Map<string, ImportedTrack>;
  imageUrl: string | null;
  addedAt: number;
}

function derivedTracks(
  playlists: ImportedPlaylist[],
  likedSongs: ImportedTrack[],
  lastImportedAt: number | null,
): { tracks: ImportedTrack[]; addedAt: Map<string, number> } {
  const tracks = new Map<string, ImportedTrack>();
  const addedAt = new Map<string, number>();

  const add = (track: ImportedTrack, at: number) => {
    if (!track?.id) return;
    if (!tracks.has(track.id)) tracks.set(track.id, track);
    addedAt.set(track.id, Math.max(addedAt.get(track.id) ?? 0, at));
  };

  for (const playlist of playlists) {
    const at = Number.isFinite(playlist.importedAt) ? playlist.importedAt : 0;
    for (const track of playlistTrackList(playlist.tracks)) add(track, at);
  }
  for (const track of playlistTrackList(likedSongs)) {
    add(track, lastImportedAt ?? 0);
  }

  return { tracks: [...tracks.values()], addedAt };
}

function albumsFrom(
  library: { tracks: ImportedTrack[]; addedAt: Map<string, number> },
): LibraryCollection[] {
  const groups = new Map<string, DerivedGroup>();
  for (const track of library.tracks) {
    const primary =
      splitArtistCredits(track.artists)[0] || "Unknown artist";
    const albumName = track.albumName?.trim() || "Unknown album";
    const key = `album:${normalize(albumName)}|${normalize(primary)}`;
    let group = groups.get(key);
    if (!group) {
      group = {
        key,
        name: albumName,
        subtitle: primary,
        tracks: new Map(),
        imageUrl: track.imageUrl || null,
        addedAt: 0,
      };
      groups.set(key, group);
    }
    if (!group.imageUrl && track.imageUrl) group.imageUrl = track.imageUrl;
    if (!group.tracks.has(track.id)) group.tracks.set(track.id, track);
    group.addedAt = Math.max(
      group.addedAt,
      library.addedAt.get(track.id) ?? 0,
    );
  }

  return [...groups.values()].map((group) => {
    const tracks = [...group.tracks.values()];
    return {
      key: group.key,
      kind: "album" as const,
      name: group.name,
      subtitle: group.subtitle,
      tracks,
      trackCount: tracks.length,
      imageUrl: group.imageUrl,
      mosaic: [],
      addedAt: group.addedAt,
      searchText: searchTextFor(group.name, group.subtitle, tracks),
    };
  });
}

function artistsFrom(library: {
  tracks: ImportedTrack[];
  addedAt: Map<string, number>;
}): LibraryCollection[] {
  const groups = new Map<string, DerivedGroup>();
  for (const track of library.tracks) {
    const credits = splitArtistCredits(track.artists);
    if (credits.length === 0) continue;
    for (const credit of credits) {
      const key = `artist:${normalize(credit)}`;
      let group = groups.get(key);
      if (!group) {
        group = {
          key,
          name: credit,
          subtitle: "Artist",
          tracks: new Map(),
          imageUrl: null,
          addedAt: 0,
        };
        groups.set(key, group);
      }
      if (!group.tracks.has(track.id)) group.tracks.set(track.id, track);
      group.addedAt = Math.max(
        group.addedAt,
        library.addedAt.get(track.id) ?? 0,
      );
    }
  }

  return [...groups.values()].map((group) => {
    const tracks = [...group.tracks.values()];
    return {
      key: group.key,
      kind: "artist" as const,
      name: group.name,
      subtitle: group.subtitle,
      tracks,
      trackCount: tracks.length,
      imageUrl: null,
      mosaic: [],
      addedAt: group.addedAt,
      searchText: searchTextFor(group.name, group.subtitle, tracks),
    };
  });
}

export function buildLibraryCollections(
  playlists: ImportedPlaylist[],
  likedSongs: ImportedTrack[],
  lastImportedAt: number | null,
): LibraryCollections {
  const imported = playlists
    .filter((playlist) => Boolean(playlist?.id))
    .map(playlistCollection);
  const liked = likedCollection(likedSongs, lastImportedAt);
  const library = derivedTracks(playlists, likedSongs, lastImportedAt);
  return {
    playlists: imported,
    liked,
    albums: albumsFrom(library),
    artists: artistsFrom(library),
  };
}

export function collectionsForFilter(
  library: LibraryCollections,
  filter: LibraryFilter,
): LibraryCollection[] {
  switch (filter) {
    case "playlists":
      return [...library.playlists];
    case "albums":
      return library.albums;
    case "artists":
      return library.artists;
    case "all":
    default:
      return [...(library.liked ? [library.liked] : []), ...library.playlists];
  }
}

export function collectionCounts(library: LibraryCollections): Record<
  LibraryFilter,
  number
> {
  return {
    all: library.playlists.length + (library.liked ? 1 : 0),
    playlists: library.playlists.length,
    albums: library.albums.length,
    artists: library.artists.length,
  };
}

export function filterCollectionsByQuery(
  collections: LibraryCollection[],
  query: string,
): LibraryCollection[] {
  const needle = normalize(query);
  if (!needle) return collections;
  return collections.filter((collection) =>
    collection.searchText.includes(needle),
  );
}

export function sortCollections(
  collections: LibraryCollection[],
  sort: LibrarySort,
): LibraryCollection[] {
  const copy = [...collections];
  copy.sort((a, b) =>
    sort === "az"
      ? a.name.localeCompare(b.name)
      : b.addedAt - a.addedAt || a.name.localeCompare(b.name),
  );
  return copy;
}

export function playlistArtworkFor(
  playlist: LibraryCollection,
): { imageUrl: string | null; mosaic: string[] } {
  return { imageUrl: playlist.imageUrl, mosaic: playlist.mosaic };
}
