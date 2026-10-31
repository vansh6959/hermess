"use client";

import { importSpotifyLibrary } from "./spotify";
import { ImportRequestError } from "./errors";
import type { ImportPayload } from "./types";
import { useUiStore } from "@/store/ui";

let activeSync: Promise<ImportPayload> | null = null;

export function syncSpotifyLibrary(): Promise<ImportPayload> {
  if (activeSync) return activeSync;

  useUiStore.getState().beginLibrarySync();

  activeSync = importSpotifyLibrary()
    .then((payload) => {
      useUiStore.getState().finishLibrarySync();
      return payload;
    })
    .catch((error: unknown) => {
      const kind =
        error instanceof ImportRequestError ? error.kind : ("error" as const);
      const message =
        error instanceof Error
          ? error.message
          : "Could not sync your Spotify library.";
      useUiStore.getState().failLibrarySync({ kind, message });
      throw error;
    })
    .finally(() => {
      activeSync = null;
    });

  return activeSync;
}
