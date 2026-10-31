/**
 * Playback is provider-independent. The UI talks to this interface only, so a
 * licensed provider SDK can be dropped in later without touching components.
 */

export interface PlaybackTrack {
  id: string;
  duration: number;
}

export interface PlaybackSnapshot {
  position: number;
  isPlaying: boolean;
  /** Emitted once when the current track reaches its end. */
  ended: boolean;
}

export interface PlaybackProvider {
  readonly simulated: boolean;
  load(track: PlaybackTrack): void;
  play(): void;
  pause(): void;
  seek(seconds: number): void;
  setVolume(volume: number): void;
  setMuted(muted: boolean): void;
  getSnapshot(): PlaybackSnapshot;
  subscribe(listener: (snapshot: PlaybackSnapshot) => void): () => void;
  dispose(): void;
}
