/**
 * Provider-independent catalog models.
 *
 * Everything the UI renders comes from these shapes, never from the mock
 * arrays directly. A future Spotify/Apple Music adapter only has to translate
 * their payloads into this vocabulary.
 */

export type ProviderId = "local-demo" | "spotify" | "apple-music" | "other";

/**
 * `demo` means the timeline is simulated, not that audio is streaming.
 * The player labels this honestly everywhere it matters.
 */
export type PlaybackEligibility = "demo" | "preview" | "full" | "unavailable";

export type ArtworkPalette = {
  /** Primary tint pulled from the artwork. */
  a: string;
  /** Secondary tint. */
  b: string;
  /** Deep grounding tint. */
  c: string;
  /** Optional 3×3 spatial averages for the full-player atmosphere. */
  grid?: string[];
};

export interface Artwork {
  src: string;
  alt: string;
  /** Curated fallback, used before client-side extraction completes. */
  palette: ArtworkPalette;
}

export interface Artist {
  id: string;
  name: string;
  bio: string;
  genres: string[];
  artwork: Artwork;
  monthlyListeners: number;
  relatedArtistIds: string[];
  providerId: ProviderId;
}

export interface Album {
  id: string;
  title: string;
  artistId: string;
  year: number;
  releaseDate: string;
  genre: string;
  description: string;
  artwork: Artwork;
  trackIds: string[];
  providerId: ProviderId;
  type: "album" | "ep";
}

export interface LyricLine {
  /** Seconds from the start of the track. */
  at: number;
  text: string;
}

export interface Track {
  id: string;
  title: string;
  artistId: string;
  albumId: string;
  duration: number;
  trackNumber: number;
  explicit: boolean;
  genres: string[];
  tags: string[];
  artwork: Artwork;
  releaseDate: string;
  providerId: ProviderId;
  /** Deep link at the original provider, when one exists. */
  providerUrl?: string;
  playbackEligibility: PlaybackEligibility;
  previewAvailable: boolean;
  metadataSource: "local-demo";
  /** Original demo lyrics. Instrumentals have no lines. */
  lyrics: LyricLine[] | null;
}

export interface Playlist {
  id: string;
  title: string;
  description: string;
  ownerName: string;
  trackIds: string[];
  artwork: Artwork;
  curated: boolean;
  providerId: ProviderId;
}

export interface Category {
  id: string;
  label: string;
  blurb: string;
  artwork: Artwork;
}

export interface SearchResults {
  tracks: Track[];
  artists: Artist[];
  albums: Album[];
  playlists: Playlist[];
}

export interface CatalogService {
  searchCatalog(query: string): SearchResults;
  getTrack(id: string): Track | undefined;
  getTracks(ids: string[]): Track[];
  getAlbum(id: string): Album | undefined;
  getArtist(id: string): Artist | undefined;
  getPlaylist(id: string): Playlist | undefined;
  getAlbums(): Album[];
  getArtists(): Artist[];
  getPlaylists(): Playlist[];
  getAllTracks(): Track[];
  getRecommendations(seedTrackId?: string): Album[];
  getRecentlyPlayed(): Track[];
  getAvailableCategories(): Category[];
  getNewReleases(): Album[];
}
