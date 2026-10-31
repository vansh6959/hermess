"use client";

import { useEffect } from "react";
import { useSpotifyPlayback } from "./SpotifyPlaybackProvider";
import { prefetchTrackLyrics } from "@/hooks/useTrackLyrics";

export function LyricsWarmup() {
  const { active, current } = useSpotifyPlayback();
  const currentId = current?.id ?? "";
  const title = current?.name ?? "";
  const artist = current?.artists ?? "";
  const album = current?.albumName ?? "";
  const durationMs = current?.durationMs ?? 0;

  useEffect(() => {
    if (!active || !currentId || !title || !artist) return;
    prefetchTrackLyrics({
      title,
      artist,
      album,
      durationSeconds: durationMs / 1000,
    });
  }, [active, album, artist, currentId, durationMs, title]);

  return null;
}
