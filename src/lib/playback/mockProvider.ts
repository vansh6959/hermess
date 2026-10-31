import type { PlaybackProvider, PlaybackSnapshot, PlaybackTrack } from "./types";

const TICK_MS = 250;

/**
 * Simulates a playback timeline. It never claims to stream audio: the UI marks
 * this provider as demo playback. All timers are cleaned up on pause, load and
 * dispose.
 */
export class MockPlaybackProvider implements PlaybackProvider {
  readonly simulated = true;

  private listeners = new Set<(snapshot: PlaybackSnapshot) => void>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private trackId: string | null = null;
  private duration = 0;
  private position = 0;
  private playing = false;
  private hasEnded = false;
  private volume = 0.8;
  private muted = false;

  load(track: PlaybackTrack): void {
    this.stopTimer();
    this.trackId = track.id;
    this.duration = Math.max(1, track.duration);
    this.position = 0;
    this.playing = false;
    this.hasEnded = false;
    this.emit();
  }

  play(): void {
    if (!this.trackId) return;
    if (this.position >= this.duration) this.position = 0;
    this.playing = true;
    this.hasEnded = false;
    this.startTimer();
    this.emit();
  }

  pause(): void {
    this.playing = false;
    this.hasEnded = false;
    this.stopTimer();
    this.emit();
  }

  seek(seconds: number): void {
    if (!this.trackId) return;
    this.position = Math.min(this.duration, Math.max(0, seconds));
    this.hasEnded = false;
    this.emit();
  }

  setVolume(volume: number): void {
    this.volume = Math.min(1, Math.max(0, volume));
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
  }

  getVolume(): number {
    return this.volume;
  }

  isMuted(): boolean {
    return this.muted;
  }

  getSnapshot(): PlaybackSnapshot {
    return {
      position: this.position,
      isPlaying: this.playing,
      ended: this.hasEnded,
    };
  }

  subscribe(listener: (snapshot: PlaybackSnapshot) => void): () => void {
    this.listeners.add(listener);
    listener(this.getSnapshot());
    return () => {
      this.listeners.delete(listener);
    };
  }

  dispose(): void {
    this.stopTimer();
    this.listeners.clear();
    this.trackId = null;
    this.playing = false;
    this.position = 0;
  }

  private startTimer(): void {
    this.stopTimer();
    this.timer = setInterval(() => {
      if (!this.playing) return;
      this.position = Math.min(
        this.duration,
        Math.round((this.position + TICK_MS / 1000) * 100) / 100,
      );
      if (this.position >= this.duration) {
        this.playing = false;
        this.hasEnded = true;
        this.stopTimer();
      }
      this.emit();
    }, TICK_MS);
  }

  private stopTimer(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private emit(): void {
    const snapshot = this.getSnapshot();
    this.listeners.forEach((listener) => listener(snapshot));
  }
}

export const playbackEngine: PlaybackProvider = new MockPlaybackProvider();
