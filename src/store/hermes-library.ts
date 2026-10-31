"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { safeLocalStorage } from "@/lib/storage";
import type {
  ImportedPlaylist,
  ImportedTrack,
  ImportPayload,
} from "@/lib/import/types";

interface HermesLibraryState {
  playlists: ImportedPlaylist[];
  likedSongs: ImportedTrack[];
  lastImportedAt: number | null;
  mergeImport: (payload: ImportPayload) => void;
  addTrackToPlaylist: (playlistId: string, track: ImportedTrack) => void;
  addPlaylist: (playlist: ImportedPlaylist) => void;
  removePlaylist: (source: string, id: string) => void;
  clearImports: () => void;
}

function playlistKey(source: string, id: string) {
  return `${source}:${id}`;
}

function trackKey(source: string, id: string) {
  return `${source}:${id}`;
}

export const useHermesLibraryStore = create<HermesLibraryState>()(
  persist<HermesLibraryState, [], [], Partial<HermesLibraryState>>(
    (set) => ({
      playlists: [],
      likedSongs: [],
      lastImportedAt: null,
      mergeImport: (payload) =>
        set((state) => {
          const playlistMap = new Map(
            state.playlists.map((playlist) => [
              playlistKey(playlist.source, playlist.id),
              playlist,
            ]),
          );
          for (const playlist of payload.playlists) {
            playlistMap.set(playlistKey(playlist.source, playlist.id), {
              ...playlist,
              importedAt: Date.now(),
            });
          }

          const likedMap = new Map(
            state.likedSongs.map((track) => [
              trackKey(track.source, track.id),
              track,
            ]),
          );
          for (const track of payload.likedSongs) {
            likedMap.set(trackKey(track.source, track.id), track);
          }

          return {
            playlists: [...playlistMap.values()],
            likedSongs: [...likedMap.values()],
            lastImportedAt: Date.now(),
          };
        }),
      addTrackToPlaylist: (playlistId, track) =>
        set((state) => ({
          playlists: state.playlists.map((playlist) =>
            playlist.source === "spotify" && playlist.id === playlistId
              ? {
                  ...playlist,
                  tracks: [...playlist.tracks, track],
                  trackCount: playlist.trackCount + 1,
                }
              : playlist,
          ),
        })),
      addPlaylist: (playlist) =>
        set((state) => ({
          playlists: [
            ...state.playlists.filter(
              (item) => playlistKey(item.source, item.id) !== playlistKey(playlist.source, playlist.id),
            ),
            playlist,
          ],
        })),
      removePlaylist: (source, id) =>
        set((state) => ({
          playlists: state.playlists.filter(
            (playlist) =>
              playlistKey(playlist.source, playlist.id) !==
              playlistKey(source, id),
          ),
        })),
      clearImports: () =>
        set({
          playlists: [],
          likedSongs: [],
          lastImportedAt: null,
        }),
    }),
    {
      name: "hermes.library.imported.v1",
      version: 1,
      storage: createJSONStorage(() => safeLocalStorage),
      skipHydration: true,
      partialize: (state) => ({
        playlists: state.playlists,
        likedSongs: state.likedSongs,
        lastImportedAt: state.lastImportedAt,
      }),
      merge: (persisted, current) => {
        const data = persisted as Partial<HermesLibraryState>;
        return {
          ...current,
          playlists: Array.isArray(data.playlists) ? data.playlists : [],
          likedSongs: Array.isArray(data.likedSongs) ? data.likedSongs : [],
          lastImportedAt:
            typeof data.lastImportedAt === "number"
              ? data.lastImportedAt
              : null,
        };
      },
    },
  ),
);
