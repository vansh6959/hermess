import { beforeEach, describe, expect, it } from "vitest";
import { useLibraryStore } from "@/store/library";

function reset() {
  useLibraryStore.setState(useLibraryStore.getInitialState(), true);
  useLibraryStore.getState().resetDemoData();
}

beforeEach(() => {
  reset();
});

describe("likes and collection", () => {
  it("toggles likes on and off", () => {
    const store = useLibraryStore.getState();
    const track = "track-doorway-weather";
    expect(store.likedTrackIds).not.toContain(track);
    expect(useLibraryStore.getState().toggleLike(track)).toBe(true);
    expect(useLibraryStore.getState().likedTrackIds[0]).toBe(track);
    expect(useLibraryStore.getState().toggleLike(track)).toBe(false);
    expect(useLibraryStore.getState().likedTrackIds).not.toContain(track);
  });

  it("toggles saved albums and followed artists", () => {
    useLibraryStore.getState().toggleSavedAlbum("album-paper-moons");
    expect(useLibraryStore.getState().savedAlbumIds).toContain("album-paper-moons");
    useLibraryStore.getState().toggleFollowArtist("artist-tidal-youth");
    expect(useLibraryStore.getState().followedArtistIds).toContain(
      "artist-tidal-youth",
    );
  });

  it("records a play once and moves it to the top", () => {
    const store = useLibraryStore.getState();
    store.recordPlayed("track-afterglow");
    store.recordPlayed("track-glass-hours");
    const recent = useLibraryStore.getState().recentlyPlayed;
    expect(recent[0].trackId).toBe("track-glass-hours");
    expect(recent.filter((entry) => entry.trackId === "track-afterglow")).toHaveLength(
      1,
    );
  });

  it("deduplicates recent searches and caps the list", () => {
    const store = useLibraryStore.getState();
    store.addSearch("glass");
    store.addSearch("glass");
    expect(
      useLibraryStore.getState().searches.filter((entry) => entry.query === "glass"),
    ).toHaveLength(1);
    for (let index = 0; index < 10; index += 1) {
      useLibraryStore.getState().addSearch(`query-${index}`);
    }
    expect(useLibraryStore.getState().searches.length).toBeLessThanOrEqual(6);
  });
});

describe("playlist management", () => {
  it("creates, renames and describes a playlist", () => {
    const id = useLibraryStore.getState().createPlaylist("Night bus", "Late rides");
    const created = useLibraryStore.getState().playlists.find((item) => item.id === id)!;
    expect(created.title).toBe("Night bus");
    expect(created.description).toBe("Late rides");

    useLibraryStore.getState().renamePlaylist(id, "Night train");
    useLibraryStore.getState().updatePlaylistDescription(id, "Updated");
    const updated = useLibraryStore.getState().playlists.find((item) => item.id === id)!;
    expect(updated.title).toBe("Night train");
    expect(updated.description).toBe("Updated");
  });

  it("adds tracks without duplicates and preserves order", () => {
    const id = useLibraryStore.getState().createPlaylist("Order test");
    useLibraryStore.getState().addTracksToPlaylist(id, [
      "track-glass-hours",
      "track-afterglow",
      "track-glass-hours",
    ]);
    const playlist = useLibraryStore.getState().playlists.find((item) => item.id === id)!;
    expect(playlist.trackIds).toEqual(["track-glass-hours", "track-afterglow"]);
  });

  it("removes and reorders tracks", () => {
    const id = useLibraryStore.getState().createPlaylist("Reorder");
    useLibraryStore.getState().addTracksToPlaylist(id, [
      "track-glass-hours",
      "track-afterglow",
      "track-low-tide",
    ]);
    useLibraryStore.getState().movePlaylistTrack(id, 0, 2);
    let playlist = useLibraryStore.getState().playlists.find((item) => item.id === id)!;
    expect(playlist.trackIds).toEqual([
      "track-afterglow",
      "track-low-tide",
      "track-glass-hours",
    ]);
    useLibraryStore.getState().removeTrackFromPlaylist(id, "track-low-tide");
    playlist = useLibraryStore.getState().playlists.find((item) => item.id === id)!;
    expect(playlist.trackIds).toEqual(["track-afterglow", "track-glass-hours"]);
  });

  it("deletes a playlist", () => {
    const id = useLibraryStore.getState().createPlaylist("Temporary");
    useLibraryStore.getState().deletePlaylist(id);
    expect(useLibraryStore.getState().playlists.some((item) => item.id === id)).toBe(
      false,
    );
  });

  it("resets demo data to the seeded snapshot", () => {
    useLibraryStore.getState().createPlaylist("Will be removed");
    useLibraryStore.getState().toggleLike("track-doorway-weather");
    useLibraryStore.getState().resetDemoData();
    const state = useLibraryStore.getState();
    expect(state.likedTrackIds).toContain("track-glass-hours");
    expect(state.playlists.some((item) => item.title === "Late Night Drive")).toBe(true);
    expect(state.playlists.some((item) => item.title === "Will be removed")).toBe(false);
  });

  it("ignores blank playlist names by falling back to a title", () => {
    const id = useLibraryStore.getState().createPlaylist("   ");
    const playlist = useLibraryStore.getState().playlists.find((item) => item.id === id)!;
    expect(playlist.title).toBe("Untitled playlist");
  });
});
