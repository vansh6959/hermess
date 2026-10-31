export type ImportSource = "spotify" | "apple";

export interface ImportedTrack {
  id: string;
  source: ImportSource;
  name: string;
  artists: string;
  albumName: string;
  imageUrl: string | null;
  durationMs: number;
  url: string | null;
}

export interface ImportedPlaylist {
  id: string;
  source: ImportSource;
  name: string;
  description: string | null;
  imageUrl: string | null;
  trackCount: number;
  tracks: ImportedTrack[];
  url: string | null;
  importedAt: number;
}

export interface ImportPayload {
  source: ImportSource;
  playlists: ImportedPlaylist[];
  likedSongs: ImportedTrack[];
}
