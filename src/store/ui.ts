"use client";

import { create } from "zustand";
import type { ImportErrorKind } from "@/lib/import/errors";

export type HomeSection =
  | "library"
  | "stats"
  | "settings"
  | "connect"
  | "profile";
export type LibrarySyncStatus = "idle" | "loading" | "success" | "error";

export interface LibrarySyncError {
  kind: ImportErrorKind;
  message: string;
}

interface UiState {
  isSearchOpen: boolean;
  isImportOpen: boolean;
  homeSection: HomeSection | null;
  librarySyncStatus: LibrarySyncStatus;
  librarySyncError: LibrarySyncError | null;
  libraryAutoAttempted: boolean;
  setSearchOpen: (open: boolean) => void;
  setImportOpen: (open: boolean) => void;
  openHomeSection: (section: HomeSection) => void;
  closeHomeSection: () => void;
  beginLibrarySync: () => void;
  finishLibrarySync: () => void;
  failLibrarySync: (error: LibrarySyncError) => void;
  markLibraryAutoAttempted: () => void;
  resetLibrarySync: () => void;
}

export const useUiStore = create<UiState>()((set) => ({
  isSearchOpen: false,
  isImportOpen: false,
  homeSection: null,
  librarySyncStatus: "idle",
  librarySyncError: null,
  libraryAutoAttempted: false,
  setSearchOpen: (isSearchOpen) => set({ isSearchOpen }),
  setImportOpen: (isImportOpen) => set({ isImportOpen }),
  openHomeSection: (homeSection) => set({ homeSection }),
  closeHomeSection: () => set({ homeSection: null }),
  beginLibrarySync: () =>
    set({ librarySyncStatus: "loading", librarySyncError: null }),
  finishLibrarySync: () =>
    set({ librarySyncStatus: "success", librarySyncError: null }),
  failLibrarySync: (librarySyncError) =>
    set({ librarySyncStatus: "error", librarySyncError }),
  markLibraryAutoAttempted: () => set({ libraryAutoAttempted: true }),
  resetLibrarySync: () =>
    set({
      librarySyncStatus: "idle",
      librarySyncError: null,
      libraryAutoAttempted: false,
    }),
}));
