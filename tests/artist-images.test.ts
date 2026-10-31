import { describe, expect, it } from "vitest";
import { batchArtistNames } from "@/hooks/useArtistImages";

describe("artist image batching", () => {
  it("keeps each API request at or below five names", () => {
    const names = Array.from({ length: 12 }, (_, index) => `Artist ${index}`);
    const batches = batchArtistNames(names);
    expect(batches.map((batch) => batch.length)).toEqual([5, 5, 2]);
    expect(batches.flat()).toEqual(names);
  });

  it("handles empty, small and exact-limit lists", () => {
    expect(batchArtistNames([])).toEqual([]);
    expect(batchArtistNames(["A", "B"])).toEqual([["A", "B"]]);
    expect(batchArtistNames(["A", "B", "C", "D", "E"])).toEqual([
      ["A", "B", "C", "D", "E"],
    ]);
  });

  it("supports an explicit batch size", () => {
    expect(batchArtistNames(["A", "B", "C", "D"], 2)).toEqual([
      ["A", "B"],
      ["C", "D"],
    ]);
  });
});
