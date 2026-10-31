import { beforeEach, describe, expect, it } from "vitest";
import { useHermesLibraryStore } from "@/store/hermes-library";
import type { ImportedPlaylist, ImportedTrack } from "@/lib/import/types";

function track(id: string, name = `Track ${id}`): ImportedTrack {
  return {
    id,
    source: "spotify",
    name,
    artists: "Test Artist",
    albumName: "Test Album",
    imageUrl: null,
    durationMs: 180000,
    url: `https://open.spotify.com/track/${id}`,
  };
}

function playlist(id: string, tracks: ImportedTrack[]): ImportedPlaylist {
  return {
    id,
    source: "spotify",
    name: `Playlist ${id}`,
    description: null,
    imageUrl: null,
    trackCount: tracks.length,
    tracks,
    url: null,
    importedAt: 1,
  };
}

beforeEach(() => {
  useHermesLibraryStore.setState({
    playlists: [],
    likedSongs: [],
    lastImportedAt: null,
  });
});

describe("imported Hermes library store", () => {
  it("uses the active imported storage key and persists only library data", () => {
    expect(useHermesLibraryStore.persist.getOptions().name).toBe(
      "hermes.library.imported.v1",
    );
    const partialize = useHermesLibraryStore.persist.getOptions().partialize;
    expect(partialize).toBeTypeOf("function");
    const persisted = partialize?.(useHermesLibraryStore.getState());
    expect(persisted).toEqual({
      playlists: [],
      likedSongs: [],
      lastImportedAt: null,
    });
  });

  it("merges real Spotify collections without duplicating ids", () => {
    const store = useHermesLibraryStore.getState();
    store.mergeImport({
      source: "spotify",
      playlists: [playlist("p1", [track("t1")])],
      likedSongs: [track("liked-1")],
    });

    useHermesLibraryStore.getState().mergeImport({
      source: "spotify",
      playlists: [playlist("p1", [track("t1"), track("t2")])],
      likedSongs: [track("liked-1"), track("liked-2")],
    });

    const state = useHermesLibraryStore.getState();
    expect(state.playlists).toHaveLength(1);
    expect(state.playlists[0].tracks.map((entry) => entry.id)).toEqual([
      "t1",
      "t2",
    ]);
    expect(state.likedSongs.map((entry) => entry.id)).toEqual([
      "liked-1",
      "liked-2",
    ]);
    expect(typeof state.lastImportedAt).toBe("number");
  });

  it("keeps existing imports when a refresh returns an empty payload", () => {
    useHermesLibraryStore.getState().mergeImport({
      source: "spotify",
      playlists: [playlist("p1", [track("t1")])],
      likedSongs: [track("liked-1")],
    });

    useHermesLibraryStore.getState().mergeImport({
      source: "spotify",
      playlists: [],
      likedSongs: [],
    });

    const state = useHermesLibraryStore.getState();
    expect(state.playlists).toHaveLength(1);
    expect(state.likedSongs).toHaveLength(1);
  });
});
