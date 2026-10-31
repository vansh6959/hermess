"use client";

import { useEffect, useMemo, useState } from "react";
import { useSpotifyHistory } from "@/hooks/useSpotifyHistory";
import { mergeHomeCovers } from "@/lib/spotify/covers";

export interface ListeningCover {
  id: string;
  title: string;
  artist: string;
  imageUrl: string;
  trackId?: string;
  albumId?: string;
}

interface DiscoverPayload {
  covers?: ListeningCover[];
}

const DISCOVER_CLIENT_TTL_MS = 5 * 60 * 1000;

let discoverCache: { at: number; covers: ListeningCover[] } | null = null;
let discoverRequest: Promise<ListeningCover[]> | null = null;

function readDiscoverPayload(payload: DiscoverPayload): ListeningCover[] {
  return (payload.covers ?? []).filter(
    (cover): cover is ListeningCover =>
      Boolean(cover?.imageUrl && cover?.title),
  );
}

// One shared request at a time. Valid results are cached briefly; transient
// failures fall back to the last good response instead of blanking the strip.
function loadDiscover(): Promise<ListeningCover[]> {
  if (
    discoverCache &&
    Date.now() - discoverCache.at < DISCOVER_CLIENT_TTL_MS
  ) {
    return Promise.resolve(discoverCache.covers);
  }
  if (discoverRequest) return discoverRequest;

  discoverRequest = fetch("/api/spotify/discover", {
    cache: "no-store",
  })
    .then(async (response) => {
      if (!response.ok) return discoverCache?.covers ?? [];
      const covers = readDiscoverPayload(
        (await response.json()) as DiscoverPayload,
      );
      if (covers.length > 0) {
        discoverCache = { at: Date.now(), covers };
        return covers;
      }
      return discoverCache?.covers ?? [];
    })
    .catch(() => discoverCache?.covers ?? [])
    .finally(() => {
      discoverRequest = null;
    });
  return discoverRequest;
}

export function useSpotifyCovers(): {
  covers: ListeningCover[];
  discover: ListeningCover[];
  loading: boolean;
} {
  const history = useSpotifyHistory();
  const [discover, setDiscover] = useState<ListeningCover[]>(
    discoverCache?.covers ?? [],
  );
  const [loading, setLoading] = useState(discoverCache === null);

  const historyCovers = useMemo(() => {
    const covers: ListeningCover[] = [];
    const seen = new Set<string>();
    for (const track of history) {
      if (!track.imageUrl) continue;
      const key = track.albumName || track.name;
      if (seen.has(key)) continue;
      seen.add(key);
      covers.push({
        id: key,
        title: track.albumName || track.name,
        artist: track.artists,
        imageUrl: track.imageUrl,
        trackId: track.id,
      });
    }
    return covers;
  }, [history]);

  useEffect(() => {
    let active = true;
    void loadDiscover().then((covers) => {
      if (!active) return;
      setDiscover(covers);
      setLoading(false);
    });

    return () => {
      active = false;
    };
  }, []);

  // Curated albums must never be suppressed by a large local history. History
  // remains first, while Discover guarantees the required international artists
  // are represented; stable album identity prevents duplicate cover entries.
  const covers = useMemo(
    () => mergeHomeCovers(historyCovers, discover),
    [discover, historyCovers],
  );

  return { covers, discover, loading };
}
