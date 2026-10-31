"use client";

import { useHermesLibraryStore } from "@/store/hermes-library";
import type { ImportPayload } from "@/lib/import/types";
import { ImportRequestError } from "@/lib/import/errors";

interface ImportErrorBody {
  error?: { message?: string };
  needsScope?: boolean;
  needsConnect?: boolean;
}

export async function importSpotifyLibrary(): Promise<ImportPayload> {
  const response = await fetch("/api/spotify/import", {
    cache: "no-store",
  });
  const payload = (await response.json().catch(() => null)) as
    | (ImportPayload & ImportErrorBody)
    | null;

  if (!response.ok || !payload) {
    if (payload?.needsScope) {
      throw new ImportRequestError(
        "scope",
        payload.error?.message ??
          "Reconnect Spotify to grant playlist and liked-songs access.",
      );
    }
    if (payload?.needsConnect) {
      throw new ImportRequestError(
        "connect",
        payload.error?.message ?? "Connect Spotify to import your library.",
      );
    }
    throw new ImportRequestError(
      "error",
      payload?.error?.message ?? "Spotify import failed.",
    );
  }

  useHermesLibraryStore.getState().mergeImport(payload);
  return payload;
}
