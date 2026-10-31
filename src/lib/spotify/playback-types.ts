export interface SpotifyProfileSummary {
  id: string;
  displayName: string;
  imageUrl: string | null;
  product: "premium" | "free";
  premium: boolean;
}

export interface SpotifySession {
  configured: boolean;
  connected: boolean;
  profile: SpotifyProfileSummary | null;
  scopes?: string[];
  canModifyPlaylists?: boolean;
}

export interface SpotifyNowPlaying {
  id: string;
  uri?: string;
  name: string;
  artists: string;
  albumName: string;
  imageUrl: string | null;
  durationMs: number;
  spotifyUrl: string;
}

export interface SpotifyPlayRequest {
  uris?: string[];
  offset?: number;
  contextUri?: string;
  contextName?: string;
  track: SpotifyNowPlaying;
  queue?: SpotifyNowPlaying[];
  queueIndex?: number;
  manualQueue?: SpotifyNowPlaying[];
  shuffle?: boolean;
}

export type SpotifyPlaybackPrompt =
  | { kind: "connect" }
  | { kind: "premium" }
  | { kind: "not_configured" }
  | { kind: "error"; message: string };
