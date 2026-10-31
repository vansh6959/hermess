import { describe, expect, it } from "vitest";
import type { ImportedTrack, ImportedPlaylist } from "@/lib/import/types";
import {
  buildLibraryCollections,
  collectionCounts,
  collectionsForFilter,
  filterCollectionsByQuery,
  sortCollections,
} from "@/lib/library/collections";

function track(
  id: string,
  name: string,
  artists: string,
  albumName: string,
  imageUrl: string | null = `/artwork/${id}.png`,
): ImportedTrack {
  return {
    id,
    source: "spotify",
    name,
    artists,
    albumName,
    imageUrl,
    durationMs: 180000,
    url: `https://open.spotify.com/track/${id}`,
  };
}

function playlist(
  id: string,
  name: string,
  tracks: ImportedTrack[],
  options: {
    imageUrl?: string | null;
    importedAt?: number;
    description?: string | null;
  } = {},
): ImportedPlaylist {
  return {
    id,
    source: "spotify",
    name,
    description: options.description ?? null,
    imageUrl: options.imageUrl ?? null,
    trackCount: tracks.length,
    tracks,
    url: null,
    importedAt: options.importedAt ?? 1,
  };
}

describe("library collections", () => {
  it("uses playlist artwork first and only builds a real-track mosaic when needed", () => {
    const withCover = playlist(
      "p1",
      "Night Drive",
      [track("t1", "One", "Artist", "Album")],
      { imageUrl: "https://images.test/night.jpg" },
    );
    const withoutCover = playlist("p2", "Morning", [
      track("t2", "Two", "Artist", "Album", "https://images.test/a.jpg"),
      track("t3", "Three", "Artist", "Album", "https://images.test/b.jpg"),
      track("t4", "Four", "Artist", "Album", "https://images.test/a.jpg"),
      track("t5", "Five", "Artist", "Album", "https://images.test/c.jpg"),
      track("t6", "Six", "Artist", "Album", "https://images.test/d.jpg"),
      track("t7", "Seven", "Artist", "Album", null),
    ]);
    const noArt = playlist("p3", "Empty Art", [
      track("t8", "Eight", "Artist", "Album", null),
    ]);

    const library = buildLibraryCollections(
      [withCover, withoutCover, noArt],
      [],
      null,
    );

    expect(library.playlists[0].imageUrl).toBe(
      "https://images.test/night.jpg",
    );
    expect(library.playlists[0].mosaic).toEqual([]);
    expect(library.playlists[1].mosaic).toEqual([
      "https://images.test/a.jpg",
      "https://images.test/b.jpg",
      "https://images.test/c.jpg",
      "https://images.test/d.jpg",
    ]);
    expect(library.playlists[2].imageUrl).toBeNull();
    expect(library.playlists[2].mosaic).toEqual([]);
  });

  it("builds liked songs and derived albums/artists from genuine track metadata", () => {
    const shared = track(
      "t1",
      "Starboy",
      "The Weeknd, Daft Punk",
      "Starboy",
      "https://images.test/starboy.jpg",
    );
    const playlists = [
      playlist("p1", "Hits", [shared], { importedAt: 10 }),
      playlist(
        "p2",
        "Late",
        [
          shared,
          track("t2", "Blinding Lights", "The Weeknd", "After Hours"),
          track("t3", "HUMBLE.", "Kendrick Lamar", "DAMN."),
        ],
        { importedAt: 30 },
      ),
    ];
    const liked = [track("t4", "Snooze", "SZA", "SOS")];

    const library = buildLibraryCollections(playlists, liked, 50);

    expect(library.liked).toMatchObject({
      key: "liked:spotify",
      name: "Liked songs",
      trackCount: 1,
    });
    expect(library.playlists).toHaveLength(2);
    expect(library.playlists[0]).toMatchObject({
      playlistId: "p1",
      trackCount: 1,
      addedAt: 10,
    });

    const albums = Object.fromEntries(
      library.albums.map((album) => [album.name, album]),
    );
    expect(albums["Starboy"].trackCount).toBe(1);
    expect(albums["Starboy"].subtitle).toBe("The Weeknd");
    expect(albums["Starboy"].addedAt).toBe(30);
    expect(albums["After Hours"].trackCount).toBe(1);
    expect(albums["SOS"].trackCount).toBe(1);

    const artists = Object.fromEntries(
      library.artists.map((artist) => [artist.name, artist]),
    );
    expect(artists["The Weeknd"].trackCount).toBe(2);
    expect(artists["Daft Punk"].trackCount).toBe(1);
    expect(artists["Kendrick Lamar"].trackCount).toBe(1);
    expect(artists["SZA"].trackCount).toBe(1);
    expect(artists["The Weeknd"].addedAt).toBe(30);
  });

  it("exposes the expected collection sets and counts", () => {
    const library = buildLibraryCollections(
      [
        playlist("p1", "Alpha", [track("t1", "A", "Artist", "Album")]),
        playlist("p2", "Beta", [track("t2", "B", "Artist", "Album Two")]),
      ],
      [track("t3", "C", "Other", "Other Album")],
      20,
    );

    expect(collectionsForFilter(library, "all").map((item) => item.name)).toEqual(
      ["Liked songs", "Alpha", "Beta"],
    );
    expect(
      collectionsForFilter(library, "playlists").map((item) => item.name),
    ).toEqual(["Alpha", "Beta"]);
    expect(
      collectionsForFilter(library, "albums").map((item) => item.name).sort(),
    ).toEqual(["Album", "Album Two", "Other Album"]);
    expect(
      collectionsForFilter(library, "artists").map((item) => item.name).sort(),
    ).toEqual(["Artist", "Other"]);
    expect(collectionCounts(library)).toEqual({
      all: 3,
      playlists: 2,
      albums: 3,
      artists: 2,
    });
  });

  it("filters by playlist name and track metadata, then sorts safely", () => {
    const library = buildLibraryCollections(
      [
        playlist("p1", "Zebra", [track("t1", "Starboy", "The Weeknd", "Starboy")], {
          importedAt: 1,
        }),
        playlist("p2", "Alpha", [track("t2", "HUMBLE.", "Kendrick Lamar", "DAMN.")], {
          importedAt: 3,
        }),
        playlist("p3", "Middle", [track("t3", "Snooze", "SZA", "SOS")], {
          importedAt: 2,
        }),
      ],
      [],
      null,
    );
    const all = collectionsForFilter(library, "all");

    expect(
      filterCollectionsByQuery(all, "starboy").map((item) => item.name),
    ).toEqual(["Zebra"]);
    expect(
      filterCollectionsByQuery(all, "kendrick").map((item) => item.name),
    ).toEqual(["Alpha"]);
    expect(filterCollectionsByQuery(all, "missing")).toEqual([]);
    expect(sortCollections(all, "az").map((item) => item.name)).toEqual([
      "Alpha",
      "Middle",
      "Zebra",
    ]);
    expect(sortCollections(all, "recent").map((item) => item.name)).toEqual([
      "Alpha",
      "Middle",
      "Zebra",
    ]);
    expect(
      sortCollections(all, "recent").map((item) => item.addedAt),
    ).toEqual([3, 2, 1]);
  });
});
