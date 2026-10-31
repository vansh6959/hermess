import { describe, expect, it } from "vitest";
import {
  buildCuratedDiscover,
  DISCOVERY_ARTISTS,
  type DiscoverApi,
} from "@/lib/spotify/discover";
import type {
  SpotifyAlbumResult,
  SpotifyArtistResult,
  SpotifySearchData,
} from "@/lib/spotify/types";

function album(
  id: string,
  name: string,
  artist: string,
  image = true,
): SpotifyAlbumResult {
  return {
    id,
    name,
    artists: artist,
    imageUrl: image ? `https://images.example/${id}.jpg` : null,
    releaseYear: "2024",
    totalTracks: 10,
    spotifyUrl: `https://open.spotify.com/album/${id}`,
  };
}

function artist(name: string): SpotifyArtistResult {
  return {
    id: `artist-${name.toLowerCase().replace(/\W+/g, "-")}`,
    name,
    imageUrl: "https://images.example/artist.jpg",
    genres: [],
    spotifyUrl: `https://open.spotify.com/artist/${name}`,
  };
}

function search(
  query: string,
  options: { albums?: SpotifyAlbumResult[]; artists?: SpotifyArtistResult[] } = {},
): SpotifySearchData {
  return {
    query,
    fetchedAt: new Date(0).toISOString(),
    tracks: [],
    albums: options.albums ?? [],
    artists: options.artists ?? [artist(query)],
  };
}

function fakeApi(overrides: Partial<DiscoverApi> = {}): DiscoverApi {
  const namesById = new Map(
    DISCOVERY_ARTISTS.map((name) => [artist(name).id, name]),
  );
  return {
    search: async (query: string) => search(query),
    artistAlbums: async (artistId: string) => {
      const name = namesById.get(artistId) ?? artistId;
      return [album(`${artistId}-album`, `${name} Album`, name)];
    },
    ...overrides,
  };
}

describe("curated Home discovery", () => {
  it("returns a verified album for every curated artist", async () => {
    const result = await buildCuratedDiscover(fakeApi());

    expect(result.complete).toBe(true);
    expect(result.missing).toEqual([]);
    expect(result.covers).toHaveLength(DISCOVERY_ARTISTS.length);
    for (const name of DISCOVERY_ARTISTS) {
      const cover = result.covers.find((item) => item.artist === name);
      expect(cover).toBeTruthy();
      expect(cover?.albumId).toBeTruthy();
      expect(cover?.imageUrl).toContain(cover?.albumId);
      expect(cover?.title).toBe(`${name} Album`);
    }
  });

  it("preserves successful artists when one lookup fails", async () => {
    const result = await buildCuratedDiscover(
      fakeApi({
        search: async (query: string) => {
          if (query === "Travis Scott") throw new Error("rate limited");
          return search(query);
        },
      }),
    );

    expect(result.complete).toBe(false);
    expect(result.missing).toEqual(["Travis Scott"]);
    expect(result.covers).toHaveLength(DISCOVERY_ARTISTS.length - 1);
    expect(result.covers.some((cover) => cover.artist === "The Weeknd")).toBe(
      true,
    );
    expect(result.covers.some((cover) => cover.artist === "Eminem")).toBe(true);
  });

  it("falls back to a matching search album when artist albums fail", async () => {
    const fallback = album("fallback-album", "Fallback Album", "Eminem");
    const result = await buildCuratedDiscover(
      fakeApi({
        search: async (query: string) =>
          query === "Eminem"
            ? search(query, { albums: [fallback] })
            : search(query),
        artistAlbums: async () => {
          throw new Error("unavailable");
        },
      }),
    );

    const cover = result.covers.find((item) => item.artist === "Eminem");
    expect(cover).toMatchObject({
      id: "fallback-album",
      title: "Fallback Album",
      albumId: "fallback-album",
      imageUrl: fallback.imageUrl,
    });
  });

  it("does not fabricate a cover from an artist image", async () => {
    const result = await buildCuratedDiscover(
      fakeApi({
        search: async (query: string) => search(query, { albums: [] }),
        artistAlbums: async () => [],
      }),
    );

    expect(result.covers).toHaveLength(0);
    expect(result.missing).toEqual([...DISCOVERY_ARTISTS]);
  });

  it("rejects albums without artwork", async () => {
    const result = await buildCuratedDiscover(
      fakeApi({
        search: async (query: string) =>
          search(query, {
            albums: [album("no-image", "No Image", query, false)],
          }),
        artistAlbums: async () => [album("no-image-2", "No Image", "unknown", false)],
      }),
    );

    expect(result.covers).toHaveLength(0);
    expect(result.complete).toBe(false);
  });
});
