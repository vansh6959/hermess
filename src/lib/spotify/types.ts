export type SpotifyErrorCode =
  | "not_configured"
  | "invalid_query"
  | "unauthorized"
  | "forbidden"
  | "rate_limited"
  | "unavailable"
  | "invalid_response"
  | "network";

export interface SpotifyTrackResult {
  id: string;
  name: string;
  artists: string;
  albumName: string;
  imageUrl: string | null;
  durationMs: number;
  explicit: boolean;
  spotifyUrl: string;
}

export interface SpotifyAlbumResult {
  id: string;
  name: string;
  artists: string;
  imageUrl: string | null;
  releaseYear: string | null;
  totalTracks: number;
  spotifyUrl: string;
  albumType?: string;
  releaseDate?: string | null;
}

export interface SpotifyArtistProfile {
  id: string;
  name: string;
  imageUrl: string | null;
  followers: number | null;
  genres: string[];
  popularity: number | null;
  spotifyUrl: string;
}

export interface SpotifyArtistDetail {
  artist: SpotifyArtistProfile;
  albums: SpotifyAlbumResult[];
  singles: SpotifyAlbumResult[];
  topTracks: SpotifyTrackResult[];
}

export interface SpotifyAlbumTracksData {
  album: SpotifyAlbumResult;
  tracks: SpotifyTrackResult[];
}

export interface SpotifyArtistResult {
  id: string;
  name: string;
  imageUrl: string | null;
  genres: string[];
  spotifyUrl: string;
}

export interface SpotifySearchData {
  query: string;
  fetchedAt: string;
  tracks: SpotifyTrackResult[];
  albums: SpotifyAlbumResult[];
  artists: SpotifyArtistResult[];
}

export interface SpotifySearchPayload extends SpotifySearchData {
  provider: "spotify";
}

export interface SpotifyApiErrorBody {
  code: SpotifyErrorCode;
  message: string;
  retryAfter?: number;
}

export interface SpotifyErrorResponse {
  error: SpotifyApiErrorBody;
}
