"use client";

import { create } from "zustand";
import type { PlaylistTrack } from "@/lib/spotify/playlist-types";

interface PlaylistDialogState {
  track: PlaylistTrack | null;
  open: (track: PlaylistTrack) => void;
  close: () => void;
}

export const usePlaylistDialogStore = create<PlaylistDialogState>()((set) => ({
  track: null,
  open: (track) => set({ track }),
  close: () => set({ track: null }),
}));
