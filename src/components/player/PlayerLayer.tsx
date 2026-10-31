"use client";

import { usePathname } from "next/navigation";
import { useSpotifyPlayback } from "@/components/providers/SpotifyPlaybackProvider";
import { SpotifyFloatingPlayer } from "./SpotifyFloatingPlayer";
import { SpotifyNowPlaying } from "./SpotifyNowPlaying";
import { SpotifyPlayerBar } from "./SpotifyPlayerBar";

export function PlayerLayer() {
  const pathname = usePathname();
  const { active, current, view } = useSpotifyPlayback();

  if (!active || !current) return null;
  if (view === "full") return <SpotifyNowPlaying />;
  if (view === "floating") return <SpotifyFloatingPlayer />;
  if (pathname === "/") return null;
  return <SpotifyPlayerBar />;
}
