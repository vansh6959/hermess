import type { SpotifyNowPlaying } from "@/lib/spotify/playback-types";

export const DESKTOP_FLOATING_CHANNEL = "hermes-desktop-floating";
// The float trusts live messages only. A cached snapshot is never good enough:
// after a reload or relaunch it would show a track that Hermes is no longer
// playing, which reads as a ghost player with no audio.
export const DESKTOP_FLOATING_STALE_MS = 5_000;

export interface DesktopFloatingState {
  current: SpotifyNowPlaying | null;
  active: boolean;
  isPlaying: boolean;
  positionMs: number;
  durationMs: number;
  volume: number;
  muted: boolean;
}

export type DesktopFloatingAction =
  | "toggle"
  | "next"
  | "previous"
  | "mute"
  | "expand"
  | "dock"
  | "request-state";

export type DesktopFloatingCommand =
  | { type: "command"; action: Exclude<DesktopFloatingAction, "volume"> }
  | { type: "command"; action: "volume"; value: number };

export type DesktopFloatingMessage =
  | { type: "state"; state: DesktopFloatingState }
  | DesktopFloatingCommand;

declare global {
  interface Window {
    hermesDesktop?: {
      isDesktop?: boolean;
      openFloating?: () => Promise<void> | void;
      closeFloating?: () => Promise<void> | void;
      focusMain?: () => Promise<void> | void;
      resizeFloating?: (height: number) => Promise<void> | void;
      dragFloatingStart?: (x: number, y: number) => void;
      dragFloatingMove?: (x: number, y: number) => void;
      dragFloatingEnd?: () => void;
    };
  }
}

export function createFloatingChannel(): BroadcastChannel | null {
  if (typeof window === "undefined" || typeof BroadcastChannel === "undefined") {
    return null;
  }
  return new BroadcastChannel(DESKTOP_FLOATING_CHANNEL);
}

export function isDesktopShell(): boolean {
  return (
    typeof window !== "undefined" &&
    Boolean(window.hermesDesktop?.isDesktop)
  );
}
