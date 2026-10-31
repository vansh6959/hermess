interface SpotifySdkImage {
  url: string;
  width?: number | null;
  height?: number | null;
}

interface SpotifySdkTrack {
  id: string | null;
  uri: string;
  name: string;
  artists?: { name: string }[];
  album?: { name: string; images: SpotifySdkImage[] };
  show?: { name: string; images: SpotifySdkImage[] };
}

interface SpotifySdkPlayerState {
  paused: boolean;
  position: number;
  duration: number;
  track_window: {
    current_track: SpotifySdkTrack;
    previous_tracks?: SpotifySdkTrack[];
    next_tracks?: SpotifySdkTrack[];
  };
}

interface SpotifySdkPlayer {
  connect(): Promise<boolean>;
  disconnect(): void;
  addListener(event: string, listener: (payload: unknown) => void): boolean;
  removeListener?(event: string, listener: (payload: unknown) => void): boolean;
  getCurrentState(): Promise<SpotifySdkPlayerState | null>;
  togglePlay(): Promise<void>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  nextTrack(): Promise<void>;
  previousTrack(): Promise<void>;
  seek(positionMs: number): Promise<void>;
  setVolume(volume: number): Promise<void>;
}

interface SpotifySdkPlayerOptions {
  name: string;
  getOAuthToken: (callback: (token: string) => void) => void;
  volume?: number;
  enableMediaSession?: boolean;
}

interface Window {
  Spotify?: {
    Player: new (options: SpotifySdkPlayerOptions) => SpotifySdkPlayer;
  };
  onSpotifyWebPlaybackSDKReady?: () => void;
}
