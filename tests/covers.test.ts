import { describe, expect, it } from "vitest";
import { mergeHomeCovers, type HomeCoverShape } from "@/lib/spotify/covers";

function cover(
  id: string,
  title: string,
  artist: string,
  albumId?: string,
): HomeCoverShape {
  return {
    id,
    title,
    artist,
    imageUrl: `https://images.example/${id}.jpg`,
    albumId,
  };
}

describe("Home cover merging", () => {
  it("keeps curated albums when listening history is full", () => {
    const history = Array.from({ length: 10 }, (_, index) =>
      cover(`history-${index}`, `History ${index}`, `Artist ${index}`),
    );
    const discover = [
      cover("after-hours", "After Hours", "The Weeknd", "album-after-hours"),
      cover("utopia", "UTOPIA", "Travis Scott", "album-utopia"),
      cover("mmlp", "The Marshall Mathers LP", "Eminem", "album-mmlp"),
    ];

    const merged = mergeHomeCovers(history, discover);

    expect(merged).toHaveLength(13);
    expect(merged.map((item) => item.title)).toEqual(
      expect.arrayContaining(["After Hours", "UTOPIA", "The Marshall Mathers LP"]),
    );
  });

  it("deduplicates by stable album id instead of image URL", () => {
    const discover = [
      {
        ...cover("curated", "After Hours", "The Weeknd", "album-after-hours"),
        imageUrl: "https://images.example/new-size.jpg",
      },
      {
        ...cover("curated-other-size", "After Hours", "The Weeknd", "album-after-hours"),
        imageUrl: "https://images.example/other-size.jpg",
      },
    ];

    expect(mergeHomeCovers([], discover)).toHaveLength(1);
  });

  it("deduplicates a history album against the same curated album", () => {
    const history = [
      {
        ...cover("history", "After Hours", "The Weeknd"),
        imageUrl: "https://images.example/old-size.jpg",
      },
    ];
    const discover = [
      {
        ...cover("curated", "After Hours", "The Weeknd", "album-after-hours"),
        imageUrl: "https://images.example/new-size.jpg",
      },
    ];

    expect(mergeHomeCovers(history, discover)).toHaveLength(1);
  });

  it("deduplicates equivalent titles when no album id exists", () => {
    const history = [cover("history", "After Hours!", "The Weeknd")];
    const discover = [cover("curated", "after hours", "The Weeknd")];

    expect(mergeHomeCovers(history, discover)).toHaveLength(1);
  });

  it("drops malformed covers without suppressing valid ones", () => {
    const history = [
      { ...cover("broken", "Missing image", "Artist"), imageUrl: "" },
    ];
    const discover = [cover("valid", "UTOPIA", "Travis Scott", "album-utopia")];

    expect(mergeHomeCovers(history, discover)).toEqual([discover[0]]);
  });
});
