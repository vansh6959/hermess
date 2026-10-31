import type { Artwork } from "@/lib/catalog/types";

export const spotifyFallbackPalette = {
  a: "#b9bab5",
  b: "#555752",
  c: "#0b0d0c",
};

export function toSpotifyArtwork(imageUrl: string | null, alt: string): Artwork {
  return {
    src: imageUrl ?? "",
    alt,
    palette: spotifyFallbackPalette,
  };
}
