"use client";

import { usePathname } from "next/navigation";
import { useSpotifyPlayback } from "@/components/providers/SpotifyPlaybackProvider";
import { useArtworkPalette } from "@/lib/palette";
import { spotifyFallbackPalette } from "@/lib/spotify/artwork";

export function HomeCoverBackdrop() {
  const pathname = usePathname();
  if (pathname !== "/") return null;
  return <HomeCoverTint />;
}

function HomeCoverTint() {
  const { active, current, isPlaying, view } = useSpotifyPlayback();
  const palette = useArtworkPalette(
    current?.imageUrl ?? undefined,
    spotifyFallbackPalette,
  );

  if (!active || !current?.imageUrl) return null;

  return (
    <div
      key={current.imageUrl}
      aria-hidden
      data-playing={isPlaying && view !== "full" ? "true" : "false"}
      data-testid="home-cover-backdrop"
      className="home-cover-backdrop"
    >
      <div
        className="home-cover-backdrop__base"
        style={{
          background: `linear-gradient(168deg, ${palette.c} 0%, #030505 54%, #020303 100%)`,
        }}
      />
      <div
        className="home-cover-backdrop__layer home-cover-backdrop__layer--a"
        style={{
          background: `radial-gradient(ellipse 60% 50% at 26% 24%, ${palette.a}66, transparent 70%), radial-gradient(ellipse 48% 46% at 72% 78%, ${palette.b}4a, transparent 72%)`,
        }}
      />
      <div
        className="home-cover-backdrop__layer home-cover-backdrop__layer--b"
        style={{
          background: `radial-gradient(ellipse 54% 44% at 76% 30%, ${palette.b}5c, transparent 70%), radial-gradient(ellipse 46% 42% at 22% 82%, ${palette.a}38, transparent 74%)`,
        }}
      />
      <div
        className="home-cover-backdrop__waterline"
        style={{
          background: `linear-gradient(102deg, transparent 16%, ${palette.a}33 44%, ${palette.b}26 58%, transparent 84%)`,
        }}
      />
      <div className="home-cover-backdrop__veil" />
    </div>
  );
}
