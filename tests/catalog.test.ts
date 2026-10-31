import { describe, expect, it } from "vitest";
import { catalog, TRACKS } from "@/lib/catalog";
import { albumDuration, artistTrackIds, trackDurationForIds } from "@/lib/catalog/derive";

describe("catalog integrity", () => {
  it("resolves every track to an artist and album", () => {
    for (const track of TRACKS) {
      expect(catalog.getArtist(track.artistId), track.id).toBeDefined();
      expect(catalog.getAlbum(track.albumId), track.id).toBeDefined();
    }
  });

  it("keeps album track lists consistent", () => {
    for (const album of catalog.getAlbums()) {
      expect(album.trackIds.length).toBeGreaterThan(0);
      for (const trackId of album.trackIds) {
        expect(catalog.getTrack(trackId)?.albumId).toBe(album.id);
      }
    }
  });

  it("sums durations", () => {
    const album = catalog.getAlbum("album-glass-hours")!;
    expect(albumDuration(album)).toBe(
      catalog
        .getTracks(album.trackIds)
        .reduce((sum, track) => sum + track.duration, 0),
    );
    expect(trackDurationForIds(album.trackIds)).toBe(albumDuration(album));
  });

  it("collects artist tracks across releases", () => {
    const ids = artistTrackIds("artist-mira-vale");
    expect(ids.length).toBeGreaterThan(0);
    expect(ids.every((id) => catalog.getTrack(id)?.artistId === "artist-mira-vale")).toBe(
      true,
    );
  });
});

describe("search", () => {
  it("returns nothing for an empty query", () => {
    const results = catalog.searchCatalog("   ");
    expect(results.tracks).toHaveLength(0);
    expect(results.albums).toHaveLength(0);
    expect(results.artists).toHaveLength(0);
    expect(results.playlists).toHaveLength(0);
  });

  it("finds tracks by title, case-insensitively", () => {
    const results = catalog.searchCatalog("GLASS HOURS");
    expect(results.tracks[0]?.title).toBe("Glass Hours");
  });

  it("finds tracks by artist name", () => {
    const results = catalog.searchCatalog("mira vale");
    expect(results.tracks.length).toBeGreaterThan(0);
    expect(
      results.tracks.every(
        (track) => catalog.getArtist(track.artistId)?.name === "Mira Vale",
      ),
    ).toBe(true);
  });

  it("finds albums, artists and playlists", () => {
    const albumResults = catalog.searchCatalog("afterglow");
    expect(albumResults.albums.some((album) => album.id === "album-afterglow")).toBe(
      true,
    );

    const artistResults = catalog.searchCatalog("noor");
    expect(artistResults.artists.some((artist) => artist.id === "artist-noor-halcyon")).toBe(
      true,
    );

    const playlistResults = catalog.searchCatalog("float");
    expect(playlistResults.playlists.some((playlist) => playlist.id === "pl-float")).toBe(
      true,
    );
  });

  it("returns empty groups for nonsense queries", () => {
    const results = catalog.searchCatalog("zzzzzzzz");
    expect(results.tracks).toHaveLength(0);
    expect(results.artists).toHaveLength(0);
    expect(results.albums).toHaveLength(0);
    expect(results.playlists).toHaveLength(0);
  });
});

describe("recommendations", () => {
  it("excludes the seed album", () => {
    const seed = catalog.getTrack("track-glass-hours")!;
    const recommendations = catalog.getRecommendations(seed.id);
    expect(recommendations.some((album) => album.id === seed.albumId)).toBe(false);
    expect(recommendations.length).toBeGreaterThan(0);
  });

  it("falls back to a broad list without a seed", () => {
    expect(catalog.getRecommendations().length).toBeGreaterThan(0);
  });
});

describe("lyrics", () => {
  it("are timestamped in order and inside the track duration", () => {
    const vocalTracks = TRACKS.filter((track) => track.lyrics?.length);
    expect(vocalTracks.length).toBeGreaterThan(0);
    for (const track of vocalTracks) {
      const lines = track.lyrics!;
      for (let index = 0; index < lines.length; index += 1) {
        expect(lines[index].at).toBeGreaterThan(0);
        expect(lines[index].at).toBeLessThan(track.duration);
        if (index > 0) expect(lines[index].at).toBeGreaterThan(lines[index - 1].at);
      }
    }
  });

  it("leaves instrumentals without lyrics", () => {
    expect(catalog.getTrack("track-static-bloom")?.lyrics).toBeNull();
    expect(catalog.getTrack("track-moonpull")?.lyrics).toBeNull();
  });
});
