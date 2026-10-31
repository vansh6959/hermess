"use client";

import { useEffect, useState } from "react";
import {
  readSpotifyHistory,
  subscribeSpotifyHistory,
  type SpotifyHistoryTrack,
} from "@/lib/spotify/history";

export function useSpotifyHistory(): SpotifyHistoryTrack[] {
  const [history, setHistory] = useState<SpotifyHistoryTrack[]>([]);

  useEffect(() => {
    const sync = () => setHistory(readSpotifyHistory());
    sync();
    return subscribeSpotifyHistory(sync);
  }, []);

  return history;
}
