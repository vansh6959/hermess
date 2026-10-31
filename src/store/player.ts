"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { z } from "zod";import { catalog } from "@/lib/catalog";
import {
  buildShuffleOrder,
  cycleRepeat,
  rebuildShuffle,
  resolveNext,
  resolvePrevious,
  type RepeatMode,
} from "@/lib/playback/queue";
import { activeProvider } from "@/lib/providers";
import { safeLocalStorage } from "@/lib/storage";
import { clamp } from "@/lib/utils";
import { withViewTransition } from "@/lib/view-transition";

export type PlayerStatus = "paused" | "playing";
export type PlayerMode = "dock" | "floating";

export interface MiniPosition {
  x: number;
  y: number;
}

interface PlayerState {
  currentTrackId: string | null;
  queueIds: string[];
  currentIndex: number;
  contextLabel: string;
  status: PlayerStatus;
  position: number;
  duration: number;
  volume: number;
  muted: boolean;
  repeat: RepeatMode;
  shuffle: boolean;
  shuffleOrder: number[];
  shufflePos: number;

  isNowPlayingOpen: boolean;
  isQueueOpen: boolean;
  lyricsVisible: boolean;
  playerMode: PlayerMode;
  miniPos: MiniPosition | null;

  playTrack: (trackId: string, queueIds?: string[], label?: string) => void;
  playCollection: (trackIds: string[], startIndex?: number, label?: string) => void;
  togglePlay: () => void;
  next: () => void;
  previous: () => void;
  advance: (auto: boolean) => void;
  seek: (seconds: number) => void;
  setVolume: (volume: number) => void;
  toggleMute: () => void;
  cycleRepeat: () => void;
  toggleShuffle: () => void;
  jumpTo: (index: number) => void;

  addToQueue: (trackId: string) => void;
  playNext: (trackId: string) => void;
  removeFromQueue: (index: number) => void;
  moveInQueue: (from: number, to: number) => void;
  clearQueue: () => void;

  openNowPlaying: () => void;
  closeNowPlaying: () => void;
  minimizeNowPlaying: () => void;
  restoreDock: () => void;
  toggleQueue: (open?: boolean) => void;
  toggleLyrics: () => void;
  setMiniPos: (position: MiniPosition | null) => void;
}

const playbackEngine = activeProvider.playback;

const persistedPlayerSchema = z.object({
  volume: z.number().min(0).max(1),
  muted: z.boolean(),
  repeat: z.enum(["off", "all", "one"]),
  lyricsVisible: z.boolean(),
});

const initialQueue = catalog.getPlaylist("pl-liquid-hours")?.trackIds ?? [];
const initialTrack = initialQueue[0] ?? null;

function shuffleFieldsFor(state: {
  queueIds: string[];
  currentIndex: number;
  shuffle: boolean;
}) {
  if (!state.shuffle || state.queueIds.length === 0) {
    return { shuffleOrder: [] as number[], shufflePos: 0 };
  }
  return {
    shuffleOrder: buildShuffleOrder(state.queueIds.length, state.currentIndex),
    shufflePos: 0,
  };
}

export const usePlayerStore = create<PlayerState>()(
  persist<PlayerState, [], [], Partial<PlayerState>>(
    (set, get) => {
      const loadAndPlay = (trackId: string, autoplay = true) => {
        const track = catalog.getTrack(trackId);
        if (!track) return false;
        playbackEngine.load({ id: track.id, duration: track.duration });
        playbackEngine.seek(0);
        if (autoplay) playbackEngine.play();
        set({
          currentTrackId: track.id,
          duration: track.duration,
          position: 0,
          status: autoplay ? "playing" : "paused",
        });
        return true;
      };

      const playAt = (index: number, shufflePos: number) => {
        const state = get();
        const trackId = state.queueIds[index];
        if (!trackId) return;
        if (!catalog.getTrack(trackId)) return;
        set({ currentIndex: index, shufflePos });
        loadAndPlay(trackId, true);
      };

      return {
        currentTrackId: initialTrack,
        queueIds: initialQueue,
        currentIndex: 0,
        contextLabel: "Liquid Hours",
        status: "paused",
        position: 0,
        duration: initialTrack ? (catalog.getTrack(initialTrack)?.duration ?? 0) : 0,
        volume: 0.78,
        muted: false,
        repeat: "off",
        shuffle: false,
        shuffleOrder: [],
        shufflePos: 0,

        isNowPlayingOpen: false,
        isQueueOpen: false,
        lyricsVisible: true,
        playerMode: "dock",
        miniPos: null,

        playTrack: (trackId, queueIds, label) => {
          const state = get();
          const nextQueue =
            queueIds && queueIds.length > 0 ? [...queueIds] : [...state.queueIds];
          let index = nextQueue.indexOf(trackId);
          if (index === -1) {
            nextQueue.unshift(trackId);
            index = 0;
          }
          set({
            queueIds: nextQueue,
            currentIndex: index,
            contextLabel: label ?? state.contextLabel,
            ...shuffleFieldsFor({
              queueIds: nextQueue,
              currentIndex: index,
              shuffle: state.shuffle,
            }),
          });
          playAt(index, 0);
        },

        playCollection: (trackIds, startIndex = 0, label) => {
          const valid = trackIds.filter((id) => Boolean(catalog.getTrack(id)));
          if (valid.length === 0) return;
          const index = clamp(startIndex, 0, valid.length - 1);
          const state = get();
          set({
            queueIds: valid,
            currentIndex: index,
            contextLabel: label ?? "Queue",
            ...shuffleFieldsFor({
              queueIds: valid,
              currentIndex: index,
              shuffle: state.shuffle,
            }),
          });
          playAt(index, 0);
        },

        togglePlay: () => {
          const state = get();
          if (!state.currentTrackId) return;
          if (state.status === "playing") {
            playbackEngine.pause();
            set({ status: "paused" });
          } else {
            playbackEngine.seek(state.position >= state.duration ? 0 : state.position);
            playbackEngine.play();
            set({
              status: "playing",
              position: state.position >= state.duration ? 0 : state.position,
            });
          }
        },

        next: () => {
          get().advance(false);
        },

        previous: () => {
          const state = get();
          if (state.position > 3) {
            get().seek(0);
            return;
          }
          const move = resolvePrevious(state);
          if (!move) {
            get().seek(0);
            return;
          }
          playAt(move.index, move.shufflePos);
        },

        advance: (auto) => {
          const state = get();
          const move = resolveNext(state, auto);
          if (!move) {
            if (auto) {
              playbackEngine.pause();
              set({
                status: "paused",
                position: state.duration,
              });
            }
            return;
          }
          playAt(move.index, move.shufflePos);
        },

        seek: (seconds) => {
          const state = get();
          const target = clamp(seconds, 0, state.duration);
          playbackEngine.seek(target);
          set({ position: target });
        },

        setVolume: (volume) => {
          const next = clamp(volume, 0, 1);
          playbackEngine.setVolume(next);
          set({ volume: next, muted: next === 0 ? get().muted : false });
        },

        toggleMute: () => {
          const next = !get().muted;
          playbackEngine.setMuted(next);
          set({ muted: next });
        },

        cycleRepeat: () => {
          set({ repeat: cycleRepeat(get().repeat) });
        },

        toggleShuffle: () => {
          const state = get();
          const shuffle = !state.shuffle;
          set({
            shuffle,
            ...shuffleFieldsFor({
              queueIds: state.queueIds,
              currentIndex: state.currentIndex,
              shuffle,
            }),
          });
        },

        jumpTo: (index) => {
          const state = get();
          if (index < 0 || index >= state.queueIds.length) return;
          const shufflePos = state.shuffle
            ? Math.max(0, state.shuffleOrder.indexOf(index))
            : 0;
          playAt(index, shufflePos);
        },

        addToQueue: (trackId) => {
          const state = get();
          if (!catalog.getTrack(trackId)) return;
          if (state.queueIds.includes(trackId)) return;

          const queueIds = [...state.queueIds, trackId];
          if (!state.currentTrackId) {
            set({ queueIds, currentIndex: 0 });
            loadAndPlay(trackId, false);
            return;
          }
          set({
            queueIds,
            ...rebuildShuffle({ ...state, queueIds }),
          });
        },

        playNext: (trackId) => {
          const state = get();
          if (!catalog.getTrack(trackId)) return;
          const filtered = state.queueIds.filter((id) => id !== trackId);
          const insertAt = state.currentTrackId
            ? Math.min(state.currentIndex + 1, filtered.length)
            : 0;
          filtered.splice(insertAt, 0, trackId);
          const currentTrackId = state.currentTrackId;
          const currentIndex = currentTrackId
            ? filtered.indexOf(currentTrackId)
            : 0;
          const nextState = {
            ...state,
            queueIds: filtered,
            currentIndex: Math.max(0, currentIndex),
          };
          set({
            queueIds: filtered,
            currentIndex: Math.max(0, currentIndex),
            ...rebuildShuffle(nextState),
          });
          if (!state.currentTrackId) loadAndPlay(trackId, false);
        },

        removeFromQueue: (index) => {
          const state = get();
          if (index === state.currentIndex) return;
          if (!state.queueIds[index]) return;
          const queueIds = state.queueIds.filter((_, i) => i !== index);
          const currentIndex =
            index < state.currentIndex ? state.currentIndex - 1 : state.currentIndex;
          const nextState = { ...state, queueIds, currentIndex };
          set({
            queueIds,
            currentIndex,
            ...rebuildShuffle(nextState),
          });
        },

        moveInQueue: (from, to) => {
          const state = get();
          if (
            from === to ||
            from < 0 ||
            to < 0 ||
            from >= state.queueIds.length ||
            to >= state.queueIds.length
          ) {
            return;
          }
          const queueIds = [...state.queueIds];
          const [moved] = queueIds.splice(from, 1);
          queueIds.splice(to, 0, moved);
          const currentTrackId = state.currentTrackId;
          const currentIndex = currentTrackId
            ? Math.max(0, queueIds.indexOf(currentTrackId))
            : 0;
          const nextState = { ...state, queueIds, currentIndex };
          set({
            queueIds,
            currentIndex,
            ...rebuildShuffle(nextState),
          });
        },

        clearQueue: () => {
          const state = get();
          if (!state.currentTrackId) {
            set({ queueIds: [], currentIndex: 0 });
            return;
          }
          const queueIds = [state.currentTrackId];
          set({
            queueIds,
            currentIndex: 0,
            shuffleOrder: [],
            shufflePos: 0,
          });
        },

        openNowPlaying: () =>
          withViewTransition(() => set({ isNowPlayingOpen: true })),
        closeNowPlaying: () =>
          withViewTransition(() => set({ isNowPlayingOpen: false })),

        minimizeNowPlaying: () =>
          withViewTransition(() =>
            set({
              isNowPlayingOpen: false,
              playerMode: "floating",
            }),
          ),

        restoreDock: () =>
          withViewTransition(() => set({ playerMode: "dock", miniPos: null })),

        toggleQueue: (open) =>
          set((state) => ({
            isQueueOpen: open ?? !state.isQueueOpen,
          })),

        toggleLyrics: () =>
          set((state) => ({ lyricsVisible: !state.lyricsVisible })),

        setMiniPos: (position) => set({ miniPos: position }),
      };
    },
    {
      name: "hermes.player.v1",
      version: 1,
      storage: createJSONStorage(() => safeLocalStorage),
      skipHydration: true,
      partialize: (state) => ({
        volume: state.volume,
        muted: state.muted,
        repeat: state.repeat,
        lyricsVisible: state.lyricsVisible,
      }),
      merge: (persisted, current) => {
        const parsed = persistedPlayerSchema.safeParse(persisted);
        if (!parsed.success) return current;
        return { ...current, ...parsed.data };
      },
    },
  ),
);

