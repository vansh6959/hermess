"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { z } from "zod";
import { catalog } from "@/lib/catalog";
import type {
  LibrarySnapshot,
  RecentEntry,
  SearchEntry,
  UserPlaylist,
} from "@/lib/library/types";
import { safeLocalStorage } from "@/lib/storage";

const SEED_AT = Date.UTC(2026, 9, 24, 22, 0, 0);

const userPlaylistSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1).max(80),
  description: z.string().max(400),
  ownerName: z.string().max(80),
  trackIds: z.array(z.string()),
  createdAt: z.number(),
  updatedAt: z.number(),
});

const persistedLibrarySchema = z.object({
  likedTrackIds: z.array(z.string()),
  savedAlbumIds: z.array(z.string()),
  followedArtistIds: z.array(z.string()),
  recentlyPlayed: z.array(z.object({ trackId: z.string(), at: z.number() })),
  playlists: z.array(userPlaylistSchema),
  searches: z.array(z.object({ query: z.string(), at: z.number() })),
});

function createInitialLibrary(): LibrarySnapshot {
  const recent = catalog.getRecentlyPlayed();
  return {
    likedTrackIds: [
      "track-glass-hours",
      "track-afterglow",
      "track-paper-moons",
      "track-low-tide",
      "track-neon-orchard",
    ],
    savedAlbumIds: ["album-glass-hours", "album-afterglow", "album-low-tide"],
    followedArtistIds: ["artist-mira-vale", "artist-june-ardor"],
    recentlyPlayed: recent.map((track, index) => ({
      trackId: track.id,
      at: SEED_AT - index * 1000 * 60 * 47,
    })),
    playlists: [
      {
        id: "pl-user-late-drive",
        title: "Late Night Drive",
        description: "Windows down, city behind you.",
        ownerName: "You (demo)",
        trackIds: [
          "track-afterglow",
          "track-glass-hours-night",
          "track-undertow",
          "track-violet-signal",
        ],
        createdAt: SEED_AT - 1000 * 60 * 60 * 24 * 12,
        updatedAt: SEED_AT - 1000 * 60 * 60 * 5,
      },
      {
        id: "pl-user-kitchen-radio",
        title: "Kitchen Radio",
        description: "For chopping vegetables and ignoring your phone.",
        ownerName: "You (demo)",
        trackIds: ["track-paper-moons", "track-cloud-room", "track-bone-china-sky"],
        createdAt: SEED_AT - 1000 * 60 * 60 * 24 * 30,
        updatedAt: SEED_AT - 1000 * 60 * 60 * 24 * 3,
      },
    ],
    searches: [
      { query: "glass hours", at: SEED_AT - 1000 * 60 * 32 },
      { query: "mira vale", at: SEED_AT - 1000 * 60 * 60 * 6 },
    ],
  };
}

interface LibraryState extends LibrarySnapshot {
  toggleLike: (trackId: string) => boolean;
  toggleSavedAlbum: (albumId: string) => boolean;
  toggleFollowArtist: (artistId: string) => boolean;
  recordPlayed: (trackId: string) => void;
  clearRecentlyPlayed: () => void;
  addSearch: (query: string) => void;
  clearSearches: () => void;

  createPlaylist: (title: string, description?: string) => string;
  renamePlaylist: (playlistId: string, title: string) => void;
  updatePlaylistDescription: (playlistId: string, description: string) => void;
  deletePlaylist: (playlistId: string) => void;
  addTracksToPlaylist: (playlistId: string, trackIds: string[]) => void;
  removeTrackFromPlaylist: (playlistId: string, trackId: string) => void;
  movePlaylistTrack: (playlistId: string, from: number, to: number) => void;

  resetDemoData: () => void;
}

function toggleId(ids: string[], id: string): { ids: string[]; added: boolean } {
  return ids.includes(id)
    ? { ids: ids.filter((item) => item !== id), added: false }
    : { ids: [id, ...ids], added: true };
}

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `pl-user-${crypto.randomUUID()}`;
  }
  return `pl-user-${Date.now()}`;
}

function updatePlaylist(
  playlists: UserPlaylist[],
  playlistId: string,
  updater: (playlist: UserPlaylist) => UserPlaylist,
): UserPlaylist[] {
  return playlists.map((playlist) =>
    playlist.id === playlistId
      ? { ...updater(playlist), updatedAt: Date.now() }
      : playlist,
  );
}

export const useLibraryStore = create<LibraryState>()(
  persist<LibraryState, [], [], LibrarySnapshot>(
    (set, get) => ({
      ...createInitialLibrary(),

      toggleLike: (trackId) => {
        const { ids, added } = toggleId(get().likedTrackIds, trackId);
        set({ likedTrackIds: ids });
        return added;
      },

      toggleSavedAlbum: (albumId) => {
        const { ids, added } = toggleId(get().savedAlbumIds, albumId);
        set({ savedAlbumIds: ids });
        return added;
      },

      toggleFollowArtist: (artistId) => {
        const { ids, added } = toggleId(get().followedArtistIds, artistId);
        set({ followedArtistIds: ids });
        return added;
      },

      recordPlayed: (trackId) => {
        if (!catalog.getTrack(trackId)) return;
        const entry: RecentEntry = { trackId, at: Date.now() };
        const rest = get().recentlyPlayed.filter(
          (item) => item.trackId !== trackId,
        );
        set({ recentlyPlayed: [entry, ...rest].slice(0, 40) });
      },

      clearRecentlyPlayed: () => set({ recentlyPlayed: [] }),

      addSearch: (query) => {
        const trimmed = query.trim();
        if (trimmed.length < 2) return;
        const entry: SearchEntry = { query: trimmed, at: Date.now() };
        const rest = get().searches.filter(
          (item) => item.query.toLowerCase() !== trimmed.toLowerCase(),
        );
        set({ searches: [entry, ...rest].slice(0, 6) });
      },

      clearSearches: () => set({ searches: [] }),

      createPlaylist: (title, description = "") => {
        const clean = title.trim() || "Untitled playlist";
        const id = newId();
        const now = Date.now();
        set((state) => ({
          playlists: [
            {
              id,
              title: clean,
              description: description.trim(),
              ownerName: "You (demo)",
              trackIds: [],
              createdAt: now,
              updatedAt: now,
            },
            ...state.playlists,
          ],
        }));
        return id;
      },

      renamePlaylist: (playlistId, title) => {
        const clean = title.trim();
        if (!clean) return;
        set((state) => ({
          playlists: updatePlaylist(state.playlists, playlistId, (playlist) => ({
            ...playlist,
            title: clean,
          })),
        }));
      },

      updatePlaylistDescription: (playlistId, description) => {
        set((state) => ({
          playlists: updatePlaylist(state.playlists, playlistId, (playlist) => ({
            ...playlist,
            description: description.trim(),
          })),
        }));
      },

      deletePlaylist: (playlistId) => {
        set((state) => ({
          playlists: state.playlists.filter(
            (playlist) => playlist.id !== playlistId,
          ),
        }));
      },

      addTracksToPlaylist: (playlistId, trackIds) => {
        const valid = trackIds.filter((id) => catalog.getTrack(id));
        if (valid.length === 0) return;
        set((state) => ({
          playlists: updatePlaylist(state.playlists, playlistId, (playlist) => ({
            ...playlist,
            trackIds: Array.from(
              new Set([...playlist.trackIds, ...valid]),
            ),
          })),
        }));
      },

      removeTrackFromPlaylist: (playlistId, trackId) => {
        set((state) => ({
          playlists: updatePlaylist(state.playlists, playlistId, (playlist) => ({
            ...playlist,
            trackIds: playlist.trackIds.filter((id) => id !== trackId),
          })),
        }));
      },

      movePlaylistTrack: (playlistId, from, to) => {
        set((state) => ({
          playlists: updatePlaylist(state.playlists, playlistId, (playlist) => {
            if (
              from === to ||
              from < 0 ||
              to < 0 ||
              from >= playlist.trackIds.length ||
              to >= playlist.trackIds.length
            ) {
              return playlist;
            }
            const trackIds = [...playlist.trackIds];
            const [moved] = trackIds.splice(from, 1);
            trackIds.splice(to, 0, moved);
            return { ...playlist, trackIds };
          }),
        }));
      },

      resetDemoData: () => set({ ...createInitialLibrary() }),
    }),
    {
      name: "hermes.library.v1",
      version: 1,
      storage: createJSONStorage(() => safeLocalStorage),
      skipHydration: true,
      partialize: (state) => ({
        likedTrackIds: state.likedTrackIds,
        savedAlbumIds: state.savedAlbumIds,
        followedArtistIds: state.followedArtistIds,
        recentlyPlayed: state.recentlyPlayed,
        playlists: state.playlists,
        searches: state.searches,
      }),
      merge: (persisted, current) => {
        const parsed = persistedLibrarySchema.safeParse(persisted);
        if (!parsed.success) return current;

        const data = parsed.data;
        return {
          ...current,
          ...data,
          likedTrackIds: data.likedTrackIds.filter((id) => catalog.getTrack(id)),
          savedAlbumIds: data.savedAlbumIds.filter((id) => catalog.getAlbum(id)),
          followedArtistIds: data.followedArtistIds.filter((id) =>
            catalog.getArtist(id),
          ),
          recentlyPlayed: data.recentlyPlayed.filter((entry) =>
            catalog.getTrack(entry.trackId),
          ),
          playlists: data.playlists.map((playlist) => ({
            ...playlist,
            trackIds: playlist.trackIds.filter((id) => catalog.getTrack(id)),
          })),
        };
      },
    },
  ),
);
