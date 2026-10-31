import type { Album, Artwork, ArtworkPalette } from "./types";
import { catalog } from "./index";

export function artistName(artistId: string): string {
  return catalog.getArtist(artistId)?.name ?? "Unknown artist";
}

export function albumDuration(album: Album): number {
  return catalog
    .getTracks(album.trackIds)
    .reduce((total, track) => total + track.duration, 0);
}

export function trackDurationForIds(trackIds: string[]): number {
  return catalog
    .getTracks(trackIds)
    .reduce((total, track) => total + track.duration, 0);
}

export function artistTrackIds(artistId: string): string[] {
  return catalog
    .getAlbums()
    .filter((album) => album.artistId === artistId)
    .flatMap((album) => album.trackIds);
}

const FALLBACK_PALETTES: ArtworkPalette[] = [
  { a: "#9fc9c0", b: "#e2ece3", c: "#1d3a3e" },
  { a: "#c8ef4f", b: "#86b23c", c: "#14220f" },
  { a: "#e6a15c", b: "#b06b8a", c: "#2c1524" },
  { a: "#b4bde8", b: "#e8e3f2", c: "#2a2f4a" },
  { a: "#f2c9a8", b: "#f7ead9", c: "#4a3a34" },
];

function hashText(text: string): number {
  let hash = 0;
  for (let index = 0; index < text.length; index += 1) {
    hash = (hash * 31 + text.charCodeAt(index)) | 0;
  }
  return Math.abs(hash);
}

/** Playlist artwork follows its first track; empty playlists get a designed gradient. */
export function artworkForUserPlaylist(playlist: {
  title: string;
  trackIds: string[];
}): Artwork {
  const first = catalog.getTrack(playlist.trackIds[0] ?? "");
  if (first) return first.artwork;
  return {
    src: "",
    alt: `${playlist.title} playlist artwork`,
    palette: FALLBACK_PALETTES[hashText(playlist.title) % FALLBACK_PALETTES.length],
  };
}

